/** Type declarations for image assets bundled by Expo Metro. */

declare module "*.png" {
  /** The platform-specific image source emitted by the Metro asset loader. */
  const source: import("react-native").ImageSourcePropType;
  export default source;
}
