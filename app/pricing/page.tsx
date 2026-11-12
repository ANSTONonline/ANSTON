import InfoPage, { pageTitle } from "../components/info-page";

export const generateMetadata = () => pageTitle("pricing");

export default function Page() {
  return <InfoPage page="pricing" />;
}
