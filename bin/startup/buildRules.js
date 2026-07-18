export function shouldBuildClient({
  forceBuild = false,
  distExists,
  currentFingerprint,
  previousFingerprint,
}) {
  return forceBuild
    || !distExists
    || !previousFingerprint
    || currentFingerprint !== previousFingerprint;
}
