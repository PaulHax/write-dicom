import dcmjs from "dcmjs";

const { DicomDict, DicomMessage } = dcmjs.data;

/**
 * Generates a unique DICOM UID
 */
function generateUID() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000);
  return `1.2.826.0.1.3680043.8.498.${timestamp}.${random}`;
}

/**
 * Writes a 2D image slice as a DICOM file using dcmjs
 * @param {Image} slice2D - The 2D slice image
 * @param {Object} metadata - DICOM metadata
 * @returns {ArrayBuffer} The DICOM file as an ArrayBuffer
 */
export function writeDicomSlice(slice2D, metadata) {
  const {
    seriesInstanceUID,
    sopInstanceUID,
    instanceNumber,
    imagePosition,
    sliceLocation,
    seriesDescription,
    seriesNumber,
    modality,
    studyInstanceUID,
    studyDate,
    studyTime,
  } = metadata;

  // Create DICOM dataset
  const dataset = {
    // SOP Common Module
    "00080016": {
      // SOPClassUID - MR Image Storage
      vr: "UI",
      Value: ["1.2.840.10008.5.1.4.1.1.4"],
    },
    "00080018": {
      // SOPInstanceUID
      vr: "UI",
      Value: [sopInstanceUID],
    },

    // Patient Module (minimal)
    "00100010": {
      // Patient Name
      vr: "PN",
      Value: [{ Alphabetic: "Anonymous" }],
    },
    "00100020": {
      // Patient ID
      vr: "LO",
      Value: ["ANON123"],
    },

    // Study Module
    "0020000D": {
      // StudyInstanceUID
      vr: "UI",
      Value: [studyInstanceUID],
    },
    "00080020": {
      // StudyDate
      vr: "DA",
      Value: [studyDate],
    },
    "00080030": {
      // StudyTime
      vr: "TM",
      Value: [studyTime],
    },

    // Series Module
    "0020000E": {
      // SeriesInstanceUID
      vr: "UI",
      Value: [seriesInstanceUID],
    },
    "00080060": {
      // Modality
      vr: "CS",
      Value: [modality],
    },
    "0008103E": {
      // SeriesDescription
      vr: "LO",
      Value: [seriesDescription],
    },
    "00200011": {
      // SeriesNumber
      vr: "IS",
      Value: [seriesNumber],
    },

    // Image Module
    "00200013": {
      // InstanceNumber
      vr: "IS",
      Value: [instanceNumber],
    },
    "00200032": {
      // ImagePositionPatient
      vr: "DS",
      Value: imagePosition,
    },
    "00201041": {
      // SliceLocation
      vr: "DS",
      Value: [sliceLocation],
    },
    "00200037": {
      // ImageOrientationPatient
      vr: "DS",
      Value: [
        slice2D.direction[0],
        slice2D.direction[1],
        0,
        slice2D.direction[2],
        slice2D.direction[3],
        0,
      ],
    },

    // Image Pixel Module
    "00280002": {
      // SamplesPerPixel
      vr: "US",
      Value: [slice2D.imageType.components],
    },
    "00280004": {
      // PhotometricInterpretation
      vr: "CS",
      Value: [slice2D.imageType.components === 1 ? "MONOCHROME2" : "RGB"],
    },
    "00280010": {
      // Rows
      vr: "US",
      Value: [slice2D.size[1]],
    },
    "00280011": {
      // Columns
      vr: "US",
      Value: [slice2D.size[0]],
    },
    "00280100": {
      // BitsAllocated
      vr: "US",
      Value: [getBitsAllocated(slice2D.imageType.componentType)],
    },
    "00280101": {
      // BitsStored
      vr: "US",
      Value: [getBitsStored(slice2D.imageType.componentType)],
    },
    "00280102": {
      // HighBit
      vr: "US",
      Value: [getBitsStored(slice2D.imageType.componentType) - 1],
    },
    "00280103": {
      // PixelRepresentation
      vr: "US",
      Value: [isSignedType(slice2D.imageType.componentType) ? 1 : 0],
    },
    "00280030": {
      // PixelSpacing
      vr: "DS",
      Value: [slice2D.spacing[1], slice2D.spacing[0]], // Row spacing, Column spacing
    },

    // Pixel Data
    "7FE00010": {
      // PixelData
      vr: getPixelDataVR(slice2D.imageType.componentType),
      Value: [slice2D.data.buffer],
    },
  };

  // Create DICOM dictionary and write
  const dicomDict = new DicomDict({});
  dicomDict.dict = dataset;

  return dicomDict.write();
}

function getBitsAllocated(componentType) {
  const bitsMap = {
    int8: 8,
    uint8: 8,
    int16: 16,
    uint16: 16,
    int32: 32,
    uint32: 32,
  };
  return bitsMap[componentType] || 16;
}

function getBitsStored(componentType) {
  return getBitsAllocated(componentType);
}

function isSignedType(componentType) {
  return componentType.startsWith("int") && !componentType.startsWith("uint");
}

function getPixelDataVR(componentType) {
  // OB for 8-bit, OW for 16-bit, OL for 32-bit
  const bits = getBitsAllocated(componentType);
  if (bits <= 8) return "OB";
  if (bits <= 16) return "OW";
  return "OL";
}

/**
 * Writes a 3D image as a DICOM series using dcmjs
 */
export async function writeImageAsDicomSeriesWithDcmjs(image3D, options = {}) {
  const {
    fileNamePattern = "slice_%04d.dcm",
    seriesDescription = "Medical Image Series",
    seriesNumber = 1,
    instanceNumberStart = 1,
    modality = "OT",
  } = options;

  const numSlices = image3D.size[2];
  const writtenFiles = [];

  // Generate UIDs for the series
  const studyInstanceUID = generateUID();
  const seriesInstanceUID = generateUID();
  const studyDate = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const studyTime = new Date().toTimeString().slice(0, 8).replace(/:/g, "");

  console.log(`Writing ${numSlices} slices with dcmjs...`);

  // Import extractSlice from the other module
  const { extractSlice } = await import("./write-image-series.js");

  for (let sliceIdx = 0; sliceIdx < numSlices; sliceIdx++) {
    try {
      // Extract 2D slice
      const slice2D = extractSlice(image3D, sliceIdx);

      // Create metadata for this slice
      const metadata = {
        seriesInstanceUID,
        sopInstanceUID: generateUID(),
        instanceNumber: sliceIdx + instanceNumberStart,
        imagePosition: [
          slice2D.origin[0],
          slice2D.origin[1],
          slice2D.zPosition,
        ],
        sliceLocation: slice2D.zPosition,
        seriesDescription,
        seriesNumber,
        modality,
        studyInstanceUID,
        studyDate,
        studyTime,
      };

      // Write DICOM file
      const dicomBuffer = writeDicomSlice(slice2D, metadata);

      // Generate filename
      const filename = fileNamePattern.replace(
        "%04d",
        String(sliceIdx).padStart(4, "0"),
      );

      // Convert to Blob
      const blob = new Blob([dicomBuffer], { type: "application/dicom" });

      writtenFiles.push({
        filename,
        blob,
        sliceIndex: sliceIdx,
        data: new Uint8Array(dicomBuffer),
      });

      if ((sliceIdx + 1) % 10 === 0 || sliceIdx === numSlices - 1) {
        console.log(`Wrote ${sliceIdx + 1}/${numSlices} slices`);
      }
    } catch (error) {
      console.error(`Error writing slice ${sliceIdx}:`, error);
      throw error;
    }
  }

  return writtenFiles;
}
