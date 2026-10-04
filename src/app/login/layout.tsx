import { MotionPreferences } from "@/components/common/motion-preferences";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <MotionPreferences>{children}</MotionPreferences>;
}
