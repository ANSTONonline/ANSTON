import InfoPage, { pageTitle } from "../components/info-page";

export const generateMetadata = () => pageTitle("howItWorks");

export default function Page() {
  return <InfoPage page="howItWorks" numbered />;
}
