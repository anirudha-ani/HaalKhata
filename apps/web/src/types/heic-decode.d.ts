/** Type declarations for heic-decode's deferred multi-image API. */

declare module "heic-decode" {
  /** Fully decoded four-channel image data. */
  interface DecodedImage {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }

  /** Image metadata whose pixels are decoded only on explicit request. */
  interface DeferredImage {
    width: number;
    height: number;
    decode(): Promise<DecodedImage>;
  }

  /** Deferred images plus the native-resource cleanup required by the library. */
  interface DeferredImages extends Array<DeferredImage> {
    dispose(): void;
  }

  /** Decodes the primary HEIC image immediately. */
  function decode(options: { buffer: Uint8Array }): Promise<DecodedImage>;

  namespace decode {
    /** Parses image metadata without allocating every decoded pixel buffer. */
    function all(options: { buffer: Uint8Array }): Promise<DeferredImages>;
  }

  export = decode;
}
