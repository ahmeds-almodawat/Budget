export interface UploadLimits {
  maxBytes: number;
  maxRows: number;
  maxColumns: number;
  maxHeaderLength: number;
  maxCellLength: number;
  maxLineLength: number;
  maxErrors: number;
  maxWarnings: number;
}

export const DEFAULT_UPLOAD_LIMITS: UploadLimits = {
  maxBytes: 5 * 1024 * 1024,
  maxRows: 25_000,
  maxColumns: 64,
  maxHeaderLength: 128,
  maxCellLength: 4_096,
  maxLineLength: 65_536,
  maxErrors: 100,
  maxWarnings: 200,
};
