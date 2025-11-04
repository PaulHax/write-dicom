# Write DICOM Series

A Javascript function for converting 3D medical images to DICOM slice series using dcmjs and ITK-Wasm. (ITK-Wasm mode does not work yet.)

## Core Function

The [`writeImageAsDicomSeriesWithDcmjs`](./src/write-dicom-dcmjs.js) function converts an ITK-Wasm 3D Image to a DICOM series:

```javascript
import { readImage } from "@itk-wasm/image-io";
import { writeImageAsDicomSeriesWithDcmjs } from "./src/write-dicom-dcmjs.js";

// Read a 3D medical image
const { image } = await readImage(file);

// Convert to DICOM series
const files = await writeImageAsDicomSeriesWithDcmjs(image, {
  fileNamePattern: "slice_%04d.dcm",
  seriesDescription: "My MRI Series",
  seriesNumber: 1,
  modality: "MR",
  instanceNumberStart: 1,
});

// files is an array of { filename, blob, data }
// Each file contains a DICOM slice that can be written to disk or downloaded
```

## Features

- Convert 3D medical images (NRRD, NIfTI, MetaImage, VTK) to DICOM series
- Configure DICOM metadata (Series Description, Modality, Series Number)
- Download output as a ZIP archive
- Automated test with MRA Head and Neck dataset from Kitware

## Installation

```bash
npm install
```

## Usage

### Web Application

Start the development server:

```bash
npm run dev
```

Then open your browser to `http://localhost:5173`

1. Select a 3D medical image file (NRRD, NIfTI, MHA, VTK)
2. Configure DICOM metadata fields
3. Click "Convert to DICOM Series"
4. Download the generated DICOM series as a ZIP file

### Automated Tests

Run the dcmjs test:

```bash
npm run test:dcmjs
```

This will:

1. Download the MRA Head and Neck dataset
2. Extract the DICOM series
3. Read the DICOM series as a 3D volume
4. Write first 10 slices to DICOM using dcmjs
5. Read back the written DICOM files with ITK-Wasm
6. Verify dimensions, spacing, and metadata match

The dcmjs implementation successfully writes valid DICOM Part 10 files that can be read back by ITK-Wasm and other DICOM viewers.

## Supported Input Formats

Any 3D medical image format that ITK-Wasm can read, including:

- NRRD (.nrrd)
- NIfTI (.nii, .nii.gz)
- MetaImage (.mha, .mhd)
- VTK (.vtk)
- DICOM series (read and re-export)
- And many more formats supported by ITK-Wasm

The `writeImageAsDicomSeriesWithDcmjs` function works with any ITK-Wasm Image object in memory, regardless of the original file format.

## DICOM Metadata

The converter generates DICOM files with the following key tags:

- **Series Instance UID (0020,000e)** - Unique series identifier
- **SOP Instance UID (0008,0018)** - Unique instance identifier per slice
- **Instance Number (0020,0013)** - Sequential slice number
- **Image Position Patient (0020,0032)** - Physical slice position in mm
- **Slice Location (0020,1041)** - Z-axis position
- **Series Description (0008,103e)** - User-defined series description
- **Series Number (0020,0011)** - User-defined series number
- **Modality (0008,0060)** - User-defined modality type

These tags ensure proper reconstruction in DICOM viewers like VolView, 3D Slicer, and OsiriX.

## Implementation Details

The converter uses **dcmjs** (pure JavaScript) to write DICOM files:

1. **ITK-Wasm** reads the input 3D medical image
2. Extracts 2D slices from the 3D volume with proper spatial coordinates
3. Preserves spatial information (origin, spacing, direction)
4. **dcmjs** generates DICOM Part 10 files with:
   - Unique DICOM UIDs for series and instances
   - Image Position (Patient) calculated for each slice
   - Proper DICOM metadata tags for 3D reconstruction
5. Each slice is written as a separate DICOM file
6. Files are packaged into a ZIP archive for download

## Testing with VolView

After generating DICOM files, you can verify proper 3D reconstruction:

1. Extract the downloaded ZIP file
2. Load the DICOM files in VolView or another DICOM viewer
3. Verify the 3D volume matches the original image dimensions
4. Check that slice spacing and orientation are correct

## Dependencies

- **[@itk-wasm/image-io](https://www.npmjs.com/package/@itk-wasm/image-io)** - Reading medical image formats
- **[@itk-wasm/dicom](https://www.npmjs.com/package/@itk-wasm/dicom)** - Reading DICOM series
- **[dcmjs](https://www.npmjs.com/package/dcmjs)** - Writing DICOM Part 10 files
- **[jszip](https://www.npmjs.com/package/jszip)** - Creating ZIP archives

## References

- [ITK-Wasm Documentation](https://wasm.itk.org/)
- [dcmjs Documentation](https://github.com/dcmjs-org/dcmjs)
