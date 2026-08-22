import {
  BookOpen, Box, BriefcaseBusiness, Dumbbell, FolderHeart, Gamepad2,
  Gift, GraduationCap, House, Leaf, Package, Palette, PawPrint,
  Plane, Shirt, ShoppingBag, Sparkles, Utensils, Wrench,
} from "lucide-react";

export const CUSTOM_MODULE_ICONS = {
  package: Package, box: Box, home: House, heart: FolderHeart, book: BookOpen,
  palette: Palette, fitness: Dumbbell, travel: Plane, food: Utensils,
  pet: PawPrint, wardrobe: Shirt, gifts: Gift, games: Gamepad2,
  learning: GraduationCap, work: BriefcaseBusiness, shopping: ShoppingBag,
  nature: Leaf, tools: Wrench, sparkles: Sparkles,
} as const;

export type CustomModuleIconName = keyof typeof CUSTOM_MODULE_ICONS;

export function CustomModuleIcon({ name, className }: { name: string; className?: string }) {
  const Icon = CUSTOM_MODULE_ICONS[name as CustomModuleIconName] ?? Package;
  return <Icon className={className} />;
}
