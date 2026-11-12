import InfoPage, { pageTitle } from "../components/info-page";

export const generateMetadata = () => pageTitle("terms");

export default function Page() {
  return <InfoPage page="terms" />;
}
