import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { zamaConfig } from "./config";
import { NdimbalDapp } from "./NdimbalDapp";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider config={zamaConfig}>
        <NdimbalDapp />
      </ZamaProvider>
    </QueryClientProvider>
  );
}
