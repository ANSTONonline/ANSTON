// Lets links to myanston.com open in the Anston Android app instead of Chrome.
// Needs ANDROID_CERT_SHA256 set in Vercel: the "App signing key certificate"
// SHA-256 fingerprint from Google Play Console → Test and release → App integrity.
// Several fingerprints can be given, separated by commas.
export function GET() {
  const prints = (process.env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (prints.length === 0) return new Response("Not found", { status: 404 });
  return Response.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.myanston.app",
        sha256_cert_fingerprints: prints,
      },
    },
  ]);
}
