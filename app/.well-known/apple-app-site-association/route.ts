// Lets links to myanston.com (like "Confirm your email") open in the Anston
// iPhone app instead of Safari. Needs APPLE_TEAM_ID set in Vercel
// (Apple Developer → Membership → Team ID).
export const APP_ID = "com.myanston.app";

export function GET() {
  const team = process.env.APPLE_TEAM_ID;
  if (!team) return new Response("Not found", { status: 404 });
  return Response.json({
    applinks: {
      details: [
        {
          appIDs: [`${team}.${APP_ID}`],
          components: [
            { "/": "/admin*", exclude: true },
            { "/": "/api/*", exclude: true },
            { "/": "*" },
          ],
        },
      ],
    },
  });
}
