# Quick Start Guide

## Project Structure

```
write-dicom/
├── index.html              # Main web interface
├── main.js                 # UI logic and event handlers
├── vite.config.js          # Vite build configuration
├── package.json            # Dependencies and scripts
├── src/
│   └── write-image-series.js   # Core DICOM writing functions
└── test/
    └── download-and-test.js    # Automated test with MRA dataset
```

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Run the Web Application

```bash
npm run dev
```

Open your browser to `http://localhost:5173`

### 3. Run the Automated Test

```bash
npm test
```

This will:
- Download the MRA Head and Neck dataset (~20 MB)
- Convert it to DICOM series
- Write output to `test/test-data/output-dicom/`

## Example Usage in Code

```javascript
import { readImage } from '@itk-wasm/image-io'
import { writeImageAsDicomSeries, downloadFilesAsZip } from './src/write-image-series.js'

// Read a 3D image
const { image } = await readImage('path/to/image.nrrd')

// Convert to DICOM series
const files = await writeImageAsDicomSeries(image, {
  fileNamePattern: 'slice_%04d.dcm',
  seriesDescription: 'My Medical Image Series',
  seriesNumber: 100,
  modality: 'MR',  // MR, CT, PT, US, XA, OT
  instanceNumberStart: 1,
  useCompression: false
})

// Download as ZIP
await downloadFilesAsZip(files, 'my-dicom-series.zip')
```

## API Reference

### `writeImageAsDicomSeries(image3D, options)`

Converts a 3D image to DICOM series.

**Parameters:**
- `image3D` (Image) - 3D image from ITK-Wasm
- `options` (Object):
  - `fileNamePattern` (string) - Output filename pattern (default: `'slice_%04d.dcm'`)
  - `seriesDescription` (string) - DICOM Series Description
  - `seriesNumber` (number) - DICOM Series Number
  - `modality` (string) - DICOM Modality code (MR, CT, PT, etc.)
  - `instanceNumberStart` (number) - Starting instance number (default: 1)
  - `useCompression` (boolean) - Enable compression (default: false)
  - `seriesInstanceUID` (string) - Custom Series UID (auto-generated if not provided)

**Returns:** `Promise<Array<{filename, blob, sliceIndex}>>`

### `extractSlice(image3D, sliceIndex)`

Extracts a 2D slice from a 3D volume.

**Parameters:**
- `image3D` (Image) - 3D image
- `sliceIndex` (number) - Index of slice to extract (0 to size[2]-1)

**Returns:** `Image` - 2D slice image

### `downloadFilesAsZip(files, zipFilename)`

Downloads files as a ZIP archive.

**Parameters:**
- `files` (Array) - Array of `{filename, blob}` objects
- `zipFilename` (string) - Name of the output ZIP file

## DICOM Tags Generated

The following DICOM tags are automatically set:

| Tag | Name | Description |
|-----|------|-------------|
| 0020,000e | Series Instance UID | Unique series identifier |
| 0008,0018 | SOP Instance UID | Unique per slice |
| 0020,0013 | Instance Number | Sequential slice number |
| 0020,0032 | Image Position (Patient) | Physical position in mm |
| 0020,1041 | Slice Location | Z-axis position |
| 0008,103e | Series Description | User-defined text |
| 0020,0011 | Series Number | User-defined number |
| 0008,0060 | Modality | MR, CT, PT, etc. |
| 0020,1002 | Images in Acquisition | Total slice count |

## Testing with Sample Data

The test downloads the MRA Head and Neck dataset from:
https://data.kitware.com/api/v1/item/6352a2b311dab8142820a33b/download

This is a real medical image volume suitable for testing DICOM conversion.

## Troubleshooting

### CORS Headers Issue

If you get CORS errors, ensure the Vite server is running with the correct headers (already configured in `vite.config.js`).

### Out of Memory

For very large images, consider processing in smaller batches or increasing Node.js memory:

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm test
```

### DICOM Viewer Not Reconstructing

Ensure:
1. All slices have the same Series Instance UID
2. Image Position (Patient) is correctly calculated
3. Slice spacing matches the original image
4. Instance Numbers are sequential

## Next Steps

- Integrate with your medical imaging pipeline
- Add support for additional DICOM tags
- Implement multi-frame DICOM output
- Add DICOM validation
