import { readImageDicomFileSeriesNode } from '@itk-wasm/dicom'
import { writeImageAsDicomSeriesWithDcmjs } from '../src/write-dicom-dcmjs.js'
import https from 'https'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import JSZip from 'jszip'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MRA_URL = 'https://data.kitware.com/api/v1/item/6352a2b311dab8142820a33b/download'
const TEST_DIR = path.join(__dirname, 'test-data-dcmjs')
const MRA_ZIP = path.join(TEST_DIR, 'MRA-Head_and_Neck.zip')
const OUTPUT_DIR = path.join(TEST_DIR, 'output-dicom')

async function downloadFile(url, outputPath) {
  console.log(`Downloading from ${url}...`)

  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
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
  }
  console.log('Extraction complete')
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

  files.sort()
  return files
}

async function runTest() {
  console.log('='.repeat(60))
  console.log('DICOM Series Writer Test - Using dcmjs')
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

    // Test dcmjs DICOM writing
    console.log('\n5. Writing DICOM series with dcmjs...')
    console.log('Testing with first 10 slices...')

    // Create a small test volume (first 10 slices)
    const smallImage = {
      ...image,
      size: [image.size[0], image.size[1], 10],
      data: image.data.slice(0, image.size[0] * image.size[1] * 10)
    }

    const files = await writeImageAsDicomSeriesWithDcmjs(smallImage, {
      fileNamePattern: 'dcmjs_slice_%04d.dcm',
      seriesDescription: 'dcmjs Test Series',
      seriesNumber: 888,
      modality: 'MR',
      instanceNumberStart: 1
    })

    console.log(`\n6. Successfully generated ${files.length} DICOM files with dcmjs!`)

    // Calculate total size
    let totalSize = 0
    for (const file of files) {
      totalSize += file.data.byteLength
    }
    console.log(`Total DICOM data size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`)

    // Write to disk
    console.log('\n7. Writing DICOM files to disk...')
    for (const file of files) {
      const outputPath = path.join(OUTPUT_DIR, file.filename)
      fs.writeFileSync(outputPath, Buffer.from(file.data))
    }
    console.log(`Wrote ${files.length} files to ${OUTPUT_DIR}`)

    // Read back the DICOM series to verify
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
    const dimMatch = smallImage.size[0] === reloadedImage.size[0] &&
                     smallImage.size[1] === reloadedImage.size[1] &&
                     smallImage.size[2] === reloadedImage.size[2]

    if (!dimMatch) {
      throw new Error(
        `Dimension mismatch! Original: ${smallImage.size.join('×')}, Reloaded: ${reloadedImage.size.join('×')}`
      )
    }

    // Compare spacing
    const spacingTolerance = 0.001
    const spacingMatch = smallImage.spacing.every((s, i) =>
      Math.abs(s - reloadedImage.spacing[i]) < spacingTolerance
    )

    if (!spacingMatch) {
      throw new Error(
        `Spacing mismatch! Original: ${smallImage.spacing.map(s => s.toFixed(3)).join('×')}, ` +
        `Reloaded: ${reloadedImage.spacing.map(s => s.toFixed(3)).join('×')}`
      )
    }

    console.log('✓ Dimensions match')
    console.log('✓ Spacing matches')
    console.log(`✓ Successfully read back ${sortedFilenames.length} DICOM files`)

    console.log('\n' + '='.repeat(60))
    console.log('✓ TEST PASSED - dcmjs works!')
    console.log('='.repeat(60))
    console.log(`\nOutput DICOM files are in: ${OUTPUT_DIR}`)
    console.log('The DICOM series was successfully written and verified with dcmjs!')

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
