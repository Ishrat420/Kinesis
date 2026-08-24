import {
  Accessibility, Activity, AlarmClock, Apple, Baby, BadgeDollarSign, Beer,
  BicepsFlexed, Bike, Binary, Bird, Bone, BookOpen, Bot, Box, Braces,
  BriefcaseBusiness, Building2, Cake, Calculator, Camera, Cat, Church,
  CloudSun, Code2, CodeXml, Coffee, Compass, Contact, CookingPot, Cpu, Crown,
  Database, Dog, Drama, Drill, Dumbbell, Factory, Film, Fish, FlaskConical,
  Flower2, Footprints,
  FolderHeart, Gamepad2, Gem, Gift, Globe2, GraduationCap, Guitar, Hammer,
  Headphones, HeartPulse, Hospital, House, KeyRound, Leaf, Library,
  GitBranch, Keyboard, Laptop, Lightbulb, Map, Mars, Medal, Microscope,
  Monitor, Mountain, Mouse, Music2, NotebookTabs, Package, Palette,
  PartyPopper, PawPrint, PersonStanding, Pill, Pizza, Plane, Rocket, Scissors,
  Shield, Shirt, ShoppingBag, Smartphone, Sofa, Sparkles, Star, Stethoscope,
  Tablet, Telescope, TentTree, Terminal, Ticket, TrainFront, TreePine, Trophy,
  Tv, Umbrella, User, UserPlus, UserRound, UsersRound, Utensils, Venus,
  Volleyball, WalletCards, Watch, Waves, Wine, Wrench, Zap,
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
  activity: Activity, alarm: AlarmClock, apple: Apple, money: BadgeDollarSign,
  drinks: Beer, bird: Bird, bone: Bone, robot: Bot, celebrations: Cake,
  calculator: Calculator, faith: Church, weather: CloudSun, coding: Code2,
  compass: Compass, cooking: CookingPot, crown: Crown, dog: Dog, drill: Drill,
  factory: Factory, movies: Film, fish: Fish, science: FlaskConical,
  guitar: Guitar, hospital: Hospital, laptop: Laptop, ideas: Lightbulb,
  maps: Map, medal: Medal, microscope: Microscope, mountains: Mountain,
  notebook: NotebookTabs, party: PartyPopper, medicine: Pill, pizza: Pizza,
  rocket: Rocket, crafts: Scissors, security: Shield, furniture: Sofa,
  doctor: Stethoscope, tickets: Ticket, train: TrainFront, sports: Volleyball,
  wine: Wine, energy: Zap,
  person: User, profile: UserRound, people: UsersRound, standing: PersonStanding,
  accessibility: Accessibility, woman: Venus, man: Mars, contacts: Contact,
  community: UserPlus, strength: BicepsFlexed, walking: Footprints,
  theatre: Drama, phone: Smartphone, tablet: Tablet, computer: Monitor,
  keyboard: Keyboard, mouse: Mouse, television: Tv, processor: Cpu,
  terminal: Terminal, code: CodeXml, braces: Braces, binary: Binary,
  database: Database, development: GitBranch,
} as const;

export type CustomModuleIconName = keyof typeof CUSTOM_MODULE_ICONS;

export function CustomModuleIcon({ name, className }: { name: string; className?: string }) {
  const Icon = CUSTOM_MODULE_ICONS[name as CustomModuleIconName] ?? Package;
  return <Icon className={className} />;
}
