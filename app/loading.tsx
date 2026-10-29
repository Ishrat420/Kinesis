import { LaunchScreen } from "@/components/layout/LaunchScreen";

/**
 * Wraps app/(app)/layout.tsx, whose data reads would otherwise hold back the
 * whole first paint -- see components/layout/LaunchScreen.tsx.
 */
export default function RootLoading() {
  return <LaunchScreen />;
}
