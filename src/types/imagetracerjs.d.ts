declare module "imagetracerjs" {
  export interface ImageTracerImageData {
    width: number;
    height: number;
    data: Uint8ClampedArray | number[];
  }

  export interface ImageTracerPaletteColor {
    r: number;
    g: number;
    b: number;
    a: number;
  }

  export interface ImageTracerOptions {
    ltres?: number;
    qtres?: number;
    pathomit?: number;
    rightangleenhance?: boolean;
    colorsampling?: 0 | 1 | 2;
    numberofcolors?: number;
    mincolorratio?: number;
    colorquantcycles?: number;
    pal?: ImageTracerPaletteColor[];
    blurradius?: number;
    blurdelta?: number;
    strokewidth?: number;
    linefilter?: boolean;
    scale?: number;
    roundcoords?: number;
    viewbox?: boolean;
    desc?: boolean;
    layering?: 0 | 1;
  }

  const ImageTracer: {
    imagedataToSVG(
      imgd: ImageTracerImageData,
      options?: ImageTracerOptions,
    ): string;
  };

  export default ImageTracer;
}
