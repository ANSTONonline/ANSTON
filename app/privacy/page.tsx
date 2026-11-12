import InfoPage, { pageTitle } from "../components/info-page";

export const generateMetadata = () => pageTitle("privacy");

export default function Page() {
  return <InfoPage page="privacy" />;
}
