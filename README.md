# Write DICOM Series

A web application for converting 3D medical images to DICOM slice series using ITK-Wasm.

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

### Automated Test

Run the automated test that downloads the MRA Head and Neck dataset:

```bash
npm test
```

This will:
1. Download the MRA Head and Neck dataset from Kitware (https://data.kitware.com)
2. Extract the DICOM series
3. Read the DICOM series as a 3D volume
4. Test slice extraction and metadata generation
5. Verify round-trip reading of DICOM series

**Note**: The test currently demonstrates slice extraction and DICOM metadata generation. The browser version fully supports writing DICOM files with the web interface.

## Supported Input Formats

- NRRD (.nrrd)
- NIfTI (.nii, .nii.gz)
- MetaImage (.mha, .mhd)
- VTK (.vtk)

## Supported Modalities

- MR (Magnetic Resonance)
- CT (Computed Tomography)
- PT (Positron Emission Tomography)
- US (Ultrasound)
- XA (X-Ray Angiography)
- OT (Other)

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

The converter:

1. Extracts 2D slices from the 3D volume
2. Preserves spatial information (origin, spacing, direction)
3. Generates unique DICOM UIDs for series and instances
4. Calculates Image Position (Patient) for each slice
5. Writes each slice as a separate DICOM file

## Testing with VolView

After generating DICOM files, you can verify proper 3D reconstruction:

1. Extract the downloaded ZIP file
2. Load the DICOM files in VolView or another DICOM viewer
3. Verify the 3D volume matches the original image dimensions
4. Check that slice spacing and orientation are correct

## Build for Production

```bash
npm run build
```

The production build will be in the `dist/` directory.

## License

Apache 2.0 (same as ITK-Wasm)

## References

- [ITK-Wasm Documentation](https://wasm.itk.org/)
- [DICOM Standard](https://www.dicomstandard.org/)
- [Kitware Data Repository](https://data.kitware.com/)
