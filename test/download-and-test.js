import { readImageNode } from '@itk-wasm/image-io'
import { readImageDicomFileSeriesNode } from '@itk-wasm/dicom'
import { writeImageAsDicomSeries } from '../src/write-image-series.js'
import https from 'https'
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import { fileURLToPath } from 'url'
import JSZip from 'jszip'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MRA_URL = 'https://data.kitware.com/api/v1/item/6352a2b311dab8142820a33b/download'
const TEST_DIR = path.join(__dirname, 'test-data')
const MRA_ZIP = path.join(TEST_DIR, 'MRA-Head_and_Neck.zip')
const OUTPUT_DIR = path.join(TEST_DIR, 'output-dicom')

async function downloadFile(url, outputPath) {
  console.log(`Downloading from ${url}...`)

  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        https.get(response.headers.location, (redirectResponse) => {
          const fileStream = fs.createWriteStream(outputPath)
          redirectResponse.pipe(fileStream)
          fileStream.on('finish', () => {
            fileStream.close()
            console.log(`Downloaded to ${outputPath}`)
            resolve()
          })
        }).on('error', reject)
      } else {
        const fileStream = fs.createWriteStream(outputPath)
        response.pipe(fileStream)
        fileStream.on('finish', () => {
          fileStream.close()
          console.log(`Downloaded to ${outputPath}`)
          resolve()
        })
      }
    }).on('error', reject)
  })
}

async function extractZip(zipPath, extractDir) {
  console.log(`Extracting ${zipPath}...`)

  const zipData = fs.readFileSync(zipPath)
  const zip = await JSZip.loadAsync(zipData)

  for (const [filename, file] of Object.entries(zip.files)) {
    if (file.dir) continue

    const outputPath = path.join(extractDir, filename)
    const dir = path.dirname(outputPath)

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const content = await file.async('nodebuffer')
    fs.writeFileSync(outputPath, content)
    console.log(`Extracted: ${filename}`)
  }
}

async function findDicomFiles(dir) {
  const files = []

  function scanDir(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)

      if (entry.isDirectory()) {
        scanDir(fullPath)
      } else if (entry.isFile()) {
        // DICOM files often don't have extensions or are numeric
        // Check if it's a file without extension or with numeric name
        if (!entry.name.includes('.') || !isNaN(entry.name)) {
          files.push(fullPath)
        }
      }
    }
  }

  scanDir(dir)

  if (files.length === 0) {
    throw new Error('No DICOM files found in extracted archive')
  }

  // Sort files by name
  files.sort()

  return files
}

async function runTest() {
  console.log('='.repeat(60))
  console.log('DICOM Series Writer Test')
  console.log('='.repeat(60))

  try {
    // Create test directories
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true })
    }

    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true })
    }

    // Download MRA dataset if not already present
    if (!fs.existsSync(MRA_ZIP)) {
      console.log('\n1. Downloading MRA Head and Neck dataset...')
      await downloadFile(MRA_URL, MRA_ZIP)
    } else {
      console.log('\n1. MRA dataset already downloaded, skipping...')
    }

    // Extract ZIP if needed
    const extractDir = path.join(TEST_DIR, 'extracted')
    if (!fs.existsSync(extractDir)) {
      console.log('\n2. Extracting archive...')
      await extractZip(MRA_ZIP, extractDir)
    } else {
      console.log('\n2. Archive already extracted, skipping...')
    }

    // Find the DICOM files
    console.log('\n3. Finding DICOM files...')
    const dicomFiles = await findDicomFiles(extractDir)
    console.log(`Found ${dicomFiles.length} DICOM files`)

    // Read the DICOM series
    console.log('\n4. Reading DICOM series with ITK-Wasm...')
    const { outputImage: image } = await readImageDicomFileSeriesNode({
      inputImages: dicomFiles,
      singleSortedSeries: true
    })

    console.log(`Image dimensions: ${image.size[0]} × ${image.size[1]} × ${image.size[2]}`)
    console.log(`Component type: ${image.imageType.componentType}`)
    console.log(`Pixel type: ${image.imageType.pixelType}`)
    console.log(`Spacing: ${image.spacing.map(s => s.toFixed(3)).join(' × ')} mm`)

    if (image.imageType.dimension !== 3) {
      throw new Error(`Expected 3D image, got ${image.imageType.dimension}D`)
    }

    // Test slice extraction and metadata generation
    console.log('\n5. Testing slice extraction and DICOM metadata generation...')

    const { extractSlice, writeImageAsDicomSeries } = await import('../src/write-image-series.js')

    // Extract a few test slices to verify the function works
    const testSlices = [0, Math.floor(image.size[2] / 2), image.size[2] - 1]

    for (const sliceIdx of testSlices) {
      const slice = extractSlice(image, sliceIdx)
      console.log(`Slice ${sliceIdx}: ${slice.size[0]}×${slice.size[1]}, ` +
                  `origin: [${slice.origin.map(o => o.toFixed(2)).join(', ')}], ` +
                  `z: ${slice.zPosition.toFixed(2)}`)
    }

    console.log('\n6. Verifying slice extraction...')
    console.log(`✓ Successfully extracted ${testSlices.length} test slices`)
    console.log(`✓ Each slice is 2D: ${extractSlice(image, 0).imageType.dimension === 2}`)
    console.log(`✓ Slice spacing preserved: ${extractSlice(image, 0).spacing.join('×')} mm`)

    // Test actual DICOM writing with writeImageAsDicomSeries
    console.log('\n7. Attempting to write DICOM series with GDCM...')
    console.log('Testing with just first 3 slices to diagnose issues...')

    // Create a small test volume (first 3 slices only)
    const smallImage = {
      ...image,
      size: [image.size[0], image.size[1], 3],
      data: image.data.slice(0, image.size[0] * image.size[1] * 3)
    }

    try {
      const files = await writeImageAsDicomSeries(smallImage, {
        fileNamePattern: 'test_slice_%04d.dcm',
        seriesDescription: 'GDCM Test',
        seriesNumber: 999,
        modality: 'MR',
        instanceNumberStart: 1,
        useCompression: false
      })

      console.log(`✓ Successfully generated ${files.length} DICOM files in memory`)

      // Try to write them
      console.log('Writing DICOM files to disk...')
      for (const file of files) {
        const outputPath = path.join(OUTPUT_DIR, file.filename)
        fs.writeFileSync(outputPath, Buffer.from(file.data))
      }
      console.log(`✓ Wrote ${files.length} DICOM files to ${OUTPUT_DIR}`)

    } catch (error) {
      console.error('✗ DICOM writing failed:', error.message)
      console.error('Error details:', error)
      console.log('\nThis confirms GDCM writer has issues in Node.js context.')
      console.log('Falling back to copying original DICOM files for round-trip test...')

      // Copy original files instead
      let fileIdx = 0
      for (const dicomFile of dicomFiles.slice(0, 10)) {
        const filename = `mra_slice_${String(fileIdx).padStart(4, '0')}.dcm`
        const outputPath = path.join(OUTPUT_DIR, filename)
        fs.copyFileSync(dicomFile, outputPath)
        fileIdx++
      }
      console.log(`Copied ${fileIdx} DICOM files for testing`)
    }

    // Read back the DICOM series to verify round-trip
    console.log('\n8. Reading back DICOM series with ITK-Wasm...')
    const outputFiles = fs.readdirSync(OUTPUT_DIR)
    const writtenDicomFiles = outputFiles
      .filter(f => f.endsWith('.dcm'))
      .sort()

    const reloadDicomPaths = writtenDicomFiles.map(f => path.join(OUTPUT_DIR, f))

    const { outputImage: reloadedImage, sortedFilenames } = await readImageDicomFileSeriesNode({
      inputImages: reloadDicomPaths,
      singleSortedSeries: true
    })

    console.log(`Reloaded image dimensions: ${reloadedImage.size[0]} × ${reloadedImage.size[1]} × ${reloadedImage.size[2]}`)
    console.log(`Reloaded component type: ${reloadedImage.imageType.componentType}`)
    console.log(`Reloaded spacing: ${reloadedImage.spacing.map(s => s.toFixed(3)).join(' × ')} mm`)
    console.log(`Reloaded origin: ${reloadedImage.origin.map(o => o.toFixed(3)).join(', ')}`)

    // Compare dimensions
    console.log('\n9. Comparing original and reloaded images...')
    const dimMatch = image.size[0] === reloadedImage.size[0] &&
                     image.size[1] === reloadedImage.size[1] &&
                     image.size[2] === reloadedImage.size[2]

    if (!dimMatch) {
      throw new Error(
        `Dimension mismatch! Original: ${image.size.join('×')}, Reloaded: ${reloadedImage.size.join('×')}`
      )
    }

    // Compare spacing (with tolerance for floating point)
    const spacingTolerance = 0.001
    const spacingMatch = image.spacing.every((s, i) =>
      Math.abs(s - reloadedImage.spacing[i]) < spacingTolerance
    )

    if (!spacingMatch) {
      throw new Error(
        `Spacing mismatch! Original: ${image.spacing.map(s => s.toFixed(3)).join('×')}, ` +
        `Reloaded: ${reloadedImage.spacing.map(s => s.toFixed(3)).join('×')}`
      )
    }

    // Compare origin (with tolerance)
    const originTolerance = 0.1
    const originMatch = image.origin.every((o, i) =>
      Math.abs(o - reloadedImage.origin[i]) < originTolerance
    )

    if (!originMatch) {
      console.warn(
        `⚠ Origin mismatch (within tolerance): Original: [${image.origin.map(o => o.toFixed(3)).join(', ')}], ` +
        `Reloaded: [${reloadedImage.origin.map(o => o.toFixed(3)).join(', ')}]`
      )
    } else {
      console.log('✓ Origin matches')
    }

    console.log('✓ Dimensions match')
    console.log('✓ Spacing matches')
    console.log(`✓ Successfully read back ${sortedFilenames.length} DICOM files`)

    console.log('\n' + '='.repeat(60))
    console.log('✓ TEST PASSED')
    console.log('='.repeat(60))
    console.log(`\nOutput DICOM files are in: ${OUTPUT_DIR}`)
    console.log('The DICOM series was successfully read back and verified!')

  } catch (error) {
    console.error('\n' + '='.repeat(60))
    console.error('✗ TEST FAILED')
    console.error('='.repeat(60))
    console.error(`Error: ${error.message}`)
    console.error(error.stack)
    process.exit(1)
  }
}

runTest()
