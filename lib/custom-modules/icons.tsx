import {
  Baby, Bike, BookOpen, Box, BriefcaseBusiness, Building2, Camera, Cat,
  Coffee, Dumbbell, Flower2, FolderHeart, Gamepad2, Gem, Gift, Globe2,
  GraduationCap, Hammer, Headphones, HeartPulse, House, KeyRound, Leaf,
  Library, Music2, Package, Palette, PawPrint, Plane, Shirt, ShoppingBag,
  Sparkles, Star, Telescope, TentTree, TreePine, Trophy, Umbrella,
  Utensils, WalletCards, Watch, Waves, Wrench,
} from "lucide-react";

export const CUSTOM_MODULE_ICONS = {
  package: Package, box: Box, home: House, heart: FolderHeart, book: BookOpen,
  palette: Palette, fitness: Dumbbell, travel: Plane, food: Utensils,
  pet: PawPrint, wardrobe: Shirt, gifts: Gift, games: Gamepad2,
  learning: GraduationCap, work: BriefcaseBusiness, shopping: ShoppingBag,
  nature: Leaf, tools: Wrench, sparkles: Sparkles,
  baby: Baby, bike: Bike, building: Building2, camera: Camera, cat: Cat,
  coffee: Coffee, flower: Flower2, gem: Gem, globe: Globe2, hammer: Hammer,
  headphones: Headphones, wellness: HeartPulse, keys: KeyRound,
  library: Library, music: Music2, star: Star, telescope: Telescope,
  camping: TentTree, outdoors: TreePine, trophy: Trophy, umbrella: Umbrella,
  wallet: WalletCards, watch: Watch, water: Waves,
} as const;

export type CustomModuleIconName = keyof typeof CUSTOM_MODULE_ICONS;

export function CustomModuleIcon({ name, className }: { name: string; className?: string }) {
  const Icon = CUSTOM_MODULE_ICONS[name as CustomModuleIconName] ?? Package;
  return <Icon className={className} />;
}
