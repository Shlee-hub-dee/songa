import {
  BarChart3,
  CheckCircle2,
  FileText,
  LayoutDashboard,
  List,
  Network,
  Plus,
  Route,
  Settings,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
import type { NavIcon as NavIconKey } from '@/lib/nav';

const ICON_MAP: Record<NavIconKey, LucideIcon> = {
  overview: LayoutDashboard,
  trips: Route,
  submit: Plus,
  approvals: CheckCircle2,
  report: BarChart3,
  disbursements: Wallet,
  statements: FileText,
  users: Users,
  org: Network,
  allTrips: Truck,
  settings: Settings,
};

export function NavIcon({ name, ...props }: { name: NavIconKey } & LucideProps) {
  // `List` is a safe fallback if NavIconKey ever drifts from ICON_MAP.
  const Icon: LucideIcon = ICON_MAP[name] ?? List;
  return <Icon {...props} />;
}
