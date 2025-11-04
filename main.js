import { readImage } from '@itk-wasm/image-io'
import { writeImageAsDicomSeriesWithDcmjs } from './src/write-dicom-dcmjs.js'
import { downloadFilesAsZip } from './src/write-image-series.js'

let selectedFile = null
let loadedImage = null

// DOM elements
const fileInput = document.getElementById('fileInput')
const fileName = document.getElementById('fileName')
const convertButton = document.getElementById('convertButton')
const progressContainer = document.getElementById('progressContainer')
const progressFill = document.getElementById('progressFill')
const statusText = document.getElementById('statusText')
const errorMsg = document.getElementById('errorMsg')
const successMsg = document.getElementById('successMsg')

// File input handler
fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0]
  if (!file) return

  selectedFile = file
  fileName.textContent = `Selected: ${file.name}`

  showError('')
  showSuccess('')

  try {
    statusText.textContent = 'Loading image...'
    progressContainer.style.display = 'block'
    updateProgress(0, 'Loading image...')

    // Read the image file
    const { image } = await readImage(file)
    loadedImage = image

    updateProgress(100, 'Image loaded successfully!')

    if (image.imageType.dimension !== 3) {
      throw new Error(`Image must be 3D. Got ${image.imageType.dimension}D image.`)
    }

    const dims = image.size
    showSuccess(`Loaded 3D image: ${dims[0]} × ${dims[1]} × ${dims[2]} (${image.imageType.componentType})`)

    convertButton.disabled = false
    progressContainer.style.display = 'none'

  } catch (error) {
    console.error('Error loading image:', error)
    showError(`Error loading image: ${error.message}`)
    convertButton.disabled = true
    progressContainer.style.display = 'none'
  }
})

// Convert button handler
convertButton.addEventListener('click', async () => {
  if (!loadedImage) {
    showError('No image loaded')
    return
  }

  try {
    convertButton.disabled = true
    showError('')
    showSuccess('')
    progressContainer.style.display = 'block'

    const options = {
      fileNamePattern: 'slice_%04d.dcm',
      seriesDescription: document.getElementById('seriesDescription').value,
      seriesNumber: parseInt(document.getElementById('seriesNumber').value, 10),
      modality: document.getElementById('modality').value,
      instanceNumberStart: parseInt(document.getElementById('instanceStart').value, 10),
      useCompression: false
    }

    updateProgress(0, 'Converting to DICOM series...')

    const files = await writeImageAsDicomSeriesWithDcmjs(loadedImage, options)

    updateProgress(90, 'Creating ZIP archive...')

    await downloadFilesAsZip(files, 'dicom-series.zip')

    updateProgress(100, 'Complete!')
    showSuccess(`Successfully converted ${files.length} slices and downloaded as dicom-series.zip`)

    setTimeout(() => {
      progressContainer.style.display = 'none'
    }, 2000)

  } catch (error) {
    console.error('Error converting image:', error)
    showError(`Error: ${error.message}`)
  } finally {
    convertButton.disabled = false
  }
})

function updateProgress(percent, message) {
  progressFill.style.width = `${percent}%`
  progressFill.textContent = `${Math.round(percent)}%`
  statusText.textContent = message
}

function showError(message) {
  if (message) {
    errorMsg.textContent = message
    errorMsg.style.display = 'block'
  } else {
    errorMsg.style.display = 'none'
  }
}

function showSuccess(message) {
  if (message) {
    successMsg.textContent = message
    successMsg.style.display = 'block'
  } else {
    successMsg.style.display = 'none'
  }
}
