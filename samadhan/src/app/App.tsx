import { BrowserRouter } from "react-router-dom";
import { AppProviders } from "./providers/AppProviders";
import { AppRoutes } from "./routes/AppRoutes";
import ScrollToTop from "@/shared/components/ScrollToTop";
import { ErrorBoundary } from "@/shared/components/ErrorBoundary";

function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <ScrollToTop />
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </BrowserRouter>
    </AppProviders>
  );
}

export default App;
