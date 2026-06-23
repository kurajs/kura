// Minimal typing for opencc-js (the published package ships its own, but we keep a
// narrow local declaration of just the API we use so the build is self-contained).
declare module "opencc-js" {
  export function Converter(options: { from: string; to: string }): (text: string) => string;
}
