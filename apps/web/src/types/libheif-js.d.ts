/** Type declarations for the parts of libheif-js's browser build the HEIC worker uses. */

declare module "libheif-js/libheif-wasm/libheif-bundle.mjs" {
  /** One image inside a HEIF file, before its pixels are decoded. */
  interface HeifImage {
    /** Native handle passed to the decode call. */
    handle: unknown;
    get_width(): number;
    get_height(): number;
    /** Releases the handle's native memory. */
    free(): void;
  }

  /** Reads a HEIF file's container and lists its top-level images. */
  interface HeifDecoder {
    decode(buffer: Uint8Array): HeifImage[];
    /** The native context, freed with `delete()`. */
    decoder: { delete(): void };
  }

  /** One plane of a decoded image; `data` is a view into the decoder's memory. */
  interface DecodedChannel {
    id: number;
    width: number;
    height: number;
    stride: number;
    data: Uint8Array;
  }

  /** A decoded image, or an error code when decoding failed. */
  interface DecodedImage {
    code?: number;
    image: unknown;
    channels: DecodedChannel[];
  }

  /** One decoder instance, with its own WebAssembly memory. */
  interface Libheif {
    ready: Promise<unknown> | unknown;
    HeifDecoder: new () => HeifDecoder;
    heif_js_decode_image2(handle: unknown, colorspace: number, chroma: number): DecodedImage | null;
    heif_image_release(image: unknown): void;
    heif_colorspace: { heif_colorspace_RGB: number };
    heif_chroma: { heif_chroma_interleaved_RGBA: number };
    heif_channel: { heif_channel_interleaved: number };
  }

  /** Creates a fresh decoder instance; each call has its own memory. */
  export default function createLibheif(): Libheif;
}
