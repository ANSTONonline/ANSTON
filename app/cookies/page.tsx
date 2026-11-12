import InfoPage, { pageTitle } from "../components/info-page";

export const generateMetadata = () => pageTitle("cookies");

export default function Page() {
  return <InfoPage page="cookies" />;
}
