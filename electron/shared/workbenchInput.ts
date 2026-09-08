// Input attachment identities shared by the workbench store and the desktop asset boundary.
/** Untrusted renderer claim. Main resolves every other attachment field. */
export type ProjectAgentAttachmentClaim = Readonly<{
  assetId: string;
  version: number;
}>;

export type ProjectAgentAttachmentRef = Readonly<{
  assetId: string;
  contentHash: string;
  version?: number;
  /** Immutable display snapshot. Asset identity remains assetId + contentHash. */
  display?: Readonly<{
    url: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    kind: "image" | "file";
  }>;
}>;
