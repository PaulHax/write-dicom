// Use GDCM writer for DICOM output
async function getWriteImage() {
  const isNode = typeof window === 'undefined'

  if (isNode) {
    const module = await import('@itk-wasm/image-io')
    return module.gdcmWriteImageNode
  } else {
    const module = await import('@itk-wasm/image-io')
    return module.gdcmWriteImage
  }
}

/**
 * Get bytes per pixel based on component type
 */
function getBytesPerPixel(componentType) {
  const typeMap = {
    'int8': 1, 'uint8': 1,
    'int16': 2, 'uint16': 2,
    'int32': 4, 'uint32': 4,
    'int64': 8, 'uint64': 8,
    'float32': 4, 'float64': 8
  }
  return typeMap[componentType] || 1
}

/**
 * Extracts a 2D slice from a 3D image volume
 * @param {Image} image3D - The 3D image
 * @param {number} sliceIndex - Index of the slice to extract
 * @returns {Image} The extracted 2D slice
 */
export function extractSlice(image3D, sliceIndex) {
  const { size, spacing, origin, direction, imageType, data } = image3D

  // Calculate slice offset
  const sliceSize = size[0] * size[1]
  const componentsPerPixel = imageType.components
  const sliceOffset = sliceIndex * sliceSize * componentsPerPixel
  const sliceLength = sliceSize * componentsPerPixel

  // Extract slice data - create new typed array of same type
  let sliceData
  if (data && typeof data.slice === 'function') {
    sliceData = data.slice(sliceOffset, sliceOffset + sliceLength)
  } else if (data && data.buffer) {
    // Handle SharedArrayBuffer or other array buffer types
    const TypedArrayConstructor = data.constructor
    sliceData = new TypedArrayConstructor(data.buffer,
      data.byteOffset + sliceOffset * data.BYTES_PER_ELEMENT,
      sliceLength)
    // Make a copy to avoid SharedArrayBuffer issues
    sliceData = new TypedArrayConstructor(sliceData)
  } else {
    throw new Error('Invalid image data format')
  }

  // Create 2D image metadata
  const slice2D = {
    imageType: {
      dimension: 2,
      componentType: imageType.componentType,
      pixelType: imageType.pixelType,
      components: imageType.components
    },
    name: `slice_${sliceIndex}`,
    origin: new Float64Array([origin[0], origin[1]]),
    spacing: new Float64Array([spacing[0], spacing[1]]),
    direction: new Float64Array([
      direction[0], direction[1],
      direction[3], direction[4]
    ]),
    size: new Uint32Array([size[0], size[1]]),
    metadata: new Map(),
    data: sliceData
  }

  // Copy metadata if present
  if (image3D.metadata && image3D.metadata instanceof Map) {
    image3D.metadata.forEach((value, key) => {
      slice2D.metadata.set(key, value)
    })
  }

  // Update slice position in world coordinates
  // New origin = original origin + sliceIndex * spacing[2] * direction_column_2
  const originX = origin[0] + sliceIndex * spacing[2] * direction[6]
  const originY = origin[1] + sliceIndex * spacing[2] * direction[7]
  slice2D.origin = new Float64Array([originX, originY])

  // Store the Z position for metadata
  const zPosition = origin[2] + sliceIndex * spacing[2] * direction[8]
  slice2D.zPosition = zPosition

  return slice2D
}

/**
 * Generates a unique identifier
 */
function generateUID() {
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 1000000)
  return `1.2.826.0.1.3680043.8.498.${timestamp}.${random}`
}

/**
 * Creates DICOM metadata for a slice
 */
function createDicomMetadataForSlice(
  originalMetadata,
  sliceIndex,
  totalSlices,
  slice2D,
  options
) {
  const metadata = new Map(originalMetadata || new Map())

  // Generate Series Instance UID if not present
  if (!metadata.has('0020|000e')) {
    metadata.set('0020|000e', options.seriesInstanceUID || generateUID())
  }

  // Generate unique SOP Instance UID for each slice
  metadata.set('0008|0018', generateUID())

  // Instance Number - unique for each slice (starts at 1)
  const instanceNumber = sliceIndex + (options.instanceNumberStart || 1)
  metadata.set('0020|0013', String(instanceNumber))

  // Image Position (Patient) - physical location of slice in mm
  const imagePosition = [
    slice2D.origin[0].toFixed(6),
    slice2D.origin[1].toFixed(6),
    slice2D.zPosition.toFixed(6)
  ].join('\\')
  metadata.set('0020|0032', imagePosition)

  // Slice Location - Z position
  metadata.set('0020|1041', String(slice2D.zPosition.toFixed(6)))

  // Series Description
  if (options.seriesDescription) {
    metadata.set('0008|103e', options.seriesDescription)
  }

  // Series Number
  if (options.seriesNumber !== undefined) {
    metadata.set('0020|0011', String(options.seriesNumber))
  }

  // Number of Images in Acquisition
  metadata.set('0020|1002', String(totalSlices))

  // Modality (if not present, default to MR for MRI, CT for CT, etc.)
  if (!metadata.has('0008|0060') && options.modality) {
    metadata.set('0008|0060', options.modality)
  }

  return metadata
}

/**
 * Writes a 3D image as a DICOM series
 * @param {Image} image3D - The 3D image to write
 * @param {Object} options - Options for writing
 * @param {string} options.fileNamePattern - Pattern for output filenames (e.g., 'slice_%04d.dcm')
 * @param {string} options.seriesDescription - DICOM Series Description
 * @param {number} options.seriesNumber - DICOM Series Number
 * @param {number} options.instanceNumberStart - Starting instance number (default: 1)
 * @param {string} options.modality - DICOM Modality (MR, CT, PT, etc.)
 * @param {string} options.seriesInstanceUID - Series Instance UID (generated if not provided)
 * @param {boolean} options.useCompression - Whether to use compression (default: false)
 * @returns {Promise<Array<{filename: string, blob: Blob}>>} Array of written files
 */
export async function writeImageAsDicomSeries(image3D, options = {}) {
  if (image3D.imageType.dimension !== 3) {
    throw new Error('Input image must be 3D')
  }

  const {
    fileNamePattern = 'slice_%04d.dcm',
    seriesDescription = 'Medical Image Series',
    seriesNumber = 1,
    instanceNumberStart = 1,
    modality = 'OT',
    seriesInstanceUID = generateUID(),
    useCompression = false
  } = options

  const numSlices = image3D.size[2]
  const writtenFiles = []

  console.log(`Writing ${numSlices} slices...`)

  for (let sliceIdx = 0; sliceIdx < numSlices; sliceIdx++) {
    // Extract 2D slice
    const slice2D = extractSlice(image3D, sliceIdx)

    // Create DICOM metadata
    slice2D.metadata = createDicomMetadataForSlice(
      image3D.metadata,
      sliceIdx,
      numSlices,
      slice2D,
      {
        seriesDescription,
        seriesNumber,
        instanceNumberStart,
        modality,
        seriesInstanceUID
      }
    )

    // Generate filename with zero-padded index
    const filename = fileNamePattern.replace('%04d', String(sliceIdx).padStart(4, '0'))

    try {
      // Debug: log slice info
      console.log(`Processing slice ${sliceIdx}:`, {
        size: slice2D.size,
        dataType: slice2D.data?.constructor?.name,
        dataLength: slice2D.data?.length,
        hasMetadata: slice2D.metadata instanceof Map,
        metadataSize: slice2D.metadata?.size
      })

      // Write slice as DICOM in memory
      const writeImage = await getWriteImage()
      const result = await writeImage(slice2D, filename, {
        useCompression
      })

      // Get the serialized DICOM data
      const imageData = result.serializedImage.data

      // Convert to Blob
      const blob = new Blob([imageData], { type: 'application/dicom' })

      writtenFiles.push({
        filename,
        blob,
        sliceIndex: sliceIdx,
        data: imageData
      })

      if ((sliceIdx + 1) % 10 === 0 || sliceIdx === numSlices - 1) {
        console.log(`Wrote ${sliceIdx + 1}/${numSlices} slices`)
      }
    } catch (error) {
      console.error(`Error writing slice ${sliceIdx}:`, error)
      console.error('Slice2D details:', {
        imageType: slice2D.imageType,
        size: slice2D.size,
        origin: slice2D.origin,
        spacing: slice2D.spacing,
        direction: slice2D.direction,
        dataType: slice2D.data?.constructor?.name,
        dataLength: slice2D.data?.length,
        dataSample: slice2D.data ? Array.from(slice2D.data.slice(0, 10)) : null
      })
      throw error
    }
  }

  return writtenFiles
}

/**
 * Download files as a ZIP archive
 * @param {Array<{filename: string, blob: Blob}>} files - Files to download
 * @param {string} zipFilename - Name of the ZIP file
 */
export async function downloadFilesAsZip(files, zipFilename = 'dicom-series.zip') {
  // Dynamically import JSZip
  const JSZip = (await import('jszip')).default

  const zip = new JSZip()

  for (const file of files) {
    zip.file(file.filename, file.blob)
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })

  // Trigger download
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = zipFilename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  console.log(`Downloaded ${files.length} files as ${zipFilename}`)
}
