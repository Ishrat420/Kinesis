"use client";

import {
  Baby,
  BookOpen,
  CalendarDays,
  Cat,
  ChevronDown,
  Heart,
  House,
  Link2,
  Maximize2,
  Minus,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Sparkles,
  StickyNote,
  Target,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type PersonIcon = "user" | "heart" | "baby" | "cat" | "home";
type Person = { id: string; name: string; detail: string; x: number; y: number; size: number; color: string; icon: PersonIcon };
type Relationship = {
  id: string;
  from: string;
  to: string;
  type: string;
  practices: { title: string; cadence: string }[];
  reflections: { text: string; date: string }[];
  linkedGoals: string[];
  importantDates: { label: string; date: string }[];
  notes: string;
};
type Selection = { kind: "person" | "relationship"; id: string } | null;

const initialPeople: Person[] = [
  { id: "ishrat", name: "Ishrat", detail: "You", x: 488, y: 250, size: 118, color: "#292524", icon: "user" },
  { id: "anj", name: "Anj", detail: "Partner", x: 745, y: 420, size: 96, color: "#9a7063", icon: "heart" },
  { id: "child", name: "Child", detail: "Family", x: 510, y: 520, size: 82, color: "#c58e52", icon: "baby" },
  { id: "sister", name: "Sister", detail: "Family", x: 795, y: 175, size: 88, color: "#6f7f72", icon: "user" },
  { id: "friend", name: "Maya", detail: "Friend", x: 225, y: 295, size: 76, color: "#7686a7", icon: "user" },
  { id: "mum", name: "Mum", detail: "Family", x: 260, y: 520, size: 92, color: "#9a6d83", icon: "home" },
];

const initialRelationships: Relationship[] = [
  { id: "c1", from: "ishrat", to: "anj", type: "Partner", practices: [{ title: "Date night", cadence: "Every Friday" }, { title: "Monthly check-in", cadence: "Every month" }], reflections: [{ text: "We've both been busy lately and date nights have helped us reconnect.", date: "22 Aug 2026" }], linkedGoals: ["Plan our autumn trip"], importantDates: [{ label: "Anniversary", date: "14 October" }], notes: "Make space for unhurried time together." },
  { id: "c2", from: "ishrat", to: "child", type: "Parent & child", practices: [{ title: "Story time", cadence: "Every evening" }], reflections: [], linkedGoals: [], importantDates: [], notes: "" },
  { id: "c3", from: "anj", to: "child", type: "Parent & child", practices: [], reflections: [], linkedGoals: [], importantDates: [], notes: "" },
  { id: "c4", from: "ishrat", to: "sister", type: "Siblings", practices: [], reflections: [], linkedGoals: [], importantDates: [], notes: "" },
  { id: "c5", from: "ishrat", to: "friend", type: "Friend", practices: [], reflections: [], linkedGoals: [], importantDates: [], notes: "" },
  { id: "c6", from: "ishrat", to: "mum", type: "Parent & child", practices: [{ title: "Call Mum", cadence: "Every Sunday" }], reflections: [], linkedGoals: [], importantDates: [], notes: "" },
];

const icons = { user: UserRound, heart: Heart, baby: Baby, cat: Cat, home: House };
const colors = ["#292524", "#9a7063", "#c58e52", "#6f7f72", "#7686a7", "#9a6d83", "#aa7866"];

export function RelationshipMap() {
  const [people, setPeople] = useState(initialPeople);
  const [relationships, setRelationships] = useState(initialRelationships);
  const [selection, setSelection] = useState<Selection>({ kind: "person", id: "anj" });
  const [scale, setScale] = useState(0.9);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const action = useRef<{ kind: "node" | "pan"; id?: string; x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("kinesis-relationship-map");
    if (saved) {
      // Restore the user's previous arrangement after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      try { setPeople(JSON.parse(saved)); } catch { /* Ignore invalid local mock state. */ }
    }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) localStorage.setItem("kinesis-relationship-map", JSON.stringify(people)); }, [people, loaded]);

  const selectedPerson = selection?.kind === "person" ? people.find((person) => person.id === selection.id) ?? null : null;
  const selectedRelationship = selection?.kind === "relationship" ? relationships.find((relationship) => relationship.id === selection.id) ?? null : null;
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);

  const pointerMove = useCallback((event: PointerEvent) => {
    if (!action.current) return;
    const dx = event.clientX - action.current.x;
    const dy = event.clientY - action.current.y;
    if (action.current.kind === "pan") setOffset({ x: action.current.ox + dx, y: action.current.oy + dy });
    else setPeople((current) => current.map((person) => person.id === action.current?.id ? { ...person, x: action.current.ox + dx / scale, y: action.current.oy + dy / scale } : person));
  }, [scale]);
  useEffect(() => {
    const stop = () => { action.current = null; };
    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", stop);
    return () => { window.removeEventListener("pointermove", pointerMove); window.removeEventListener("pointerup", stop); };
  }, [pointerMove]);

  function startNodeDrag(event: ReactPointerEvent, person: Person) {
    event.stopPropagation();
    action.current = { kind: "node", id: person.id, x: event.clientX, y: event.clientY, ox: person.x, oy: person.y };
    if (linkFrom && linkFrom !== person.id) {
      setRelationships((current) => [...current, { id: crypto.randomUUID(), from: linkFrom, to: person.id, type: "Relationship", practices: [], reflections: [], linkedGoals: [], importantDates: [], notes: "" }]);
      setLinkFrom(null);
    }
    setSelection({ kind: "person", id: person.id });
  }
  function startPan(event: ReactPointerEvent) {
    if (event.target !== canvas.current) return;
    action.current = { kind: "pan", x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    setSelection(null);
  }
  function updateSelected(patch: Partial<Person>) {
    if (selection?.kind !== "person") return;
    setPeople((current) => current.map((person) => person.id === selection.id ? { ...person, ...patch } : person));
  }
  function addPerson() {
    const id = crypto.randomUUID();
    setPeople((current) => [...current, { id, name: "New person", detail: "Relationship", x: 430 - offset.x / scale, y: 340 - offset.y / scale, size: 84, color: "#aa7866", icon: "user" }]);
    setSelection({ kind: "person", id });
  }
  function reset() {
    setPeople(initialPeople); setRelationships(initialRelationships); setOffset({ x: 0, y: 0 }); setScale(0.9); setSelection({ kind: "person", id: "anj" });
  }

  return (
    <section className="min-w-0 flex-1 px-5 py-5 lg:px-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-400"><span>Relationships</span><span>/</span><span className="text-zinc-600">My constellation</span></div>
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.035em]">Your people, in orbit</h1>
          <p className="mt-1 text-sm text-zinc-500">Arrange your relationships in a way that feels true to you.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={reset} className="map-button"><RotateCcw /> Reset</button>
          <button onClick={addPerson} className="map-button map-button-dark"><Plus /> Add person</button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-190px)] min-h-[620px] overflow-hidden rounded-[26px] border border-zinc-200 bg-white shadow-[0_16px_50px_rgba(24,24,27,0.06)]">
        <div className="relative min-w-0 flex-1 overflow-hidden bg-[#f7f8f7]">
          <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(#c9ccca_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="absolute left-5 top-5 z-20 flex items-center gap-2 rounded-xl border border-zinc-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur">
            <span className="px-2 text-xs font-semibold text-zinc-600">My constellation</span><ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
          </div>
          {linkFrom && <div className="absolute left-1/2 top-5 z-30 -translate-x-1/2 rounded-full bg-zinc-900 px-4 py-2 text-xs font-medium text-white shadow-lg">Choose another person to connect <button onClick={() => setLinkFrom(null)} className="ml-2"><X className="inline h-3.5 w-3.5" /></button></div>}

          <div ref={canvas} onPointerDown={startPan} className="absolute inset-0 cursor-grab active:cursor-grabbing touch-none">
            <div style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: "0 0" }} className="absolute inset-0">
              <svg className="absolute inset-0 h-full w-full overflow-visible">
                {relationships.map((relationship) => {
                  const from = peopleById.get(relationship.from); const to = peopleById.get(relationship.to);
                  if (!from || !to) return null;
                  const x1 = from.x + from.size / 2, y1 = from.y + from.size / 2, x2 = to.x + to.size / 2, y2 = to.y + to.size / 2;
                  const path = `M ${x1} ${y1} C ${(x1+x2)/2} ${y1}, ${(x1+x2)/2} ${y2}, ${x2} ${y2}`;
                  const chosen = selection?.kind === "relationship" && selection.id === relationship.id;
                  return <g key={relationship.id} className="group cursor-pointer" onPointerDown={(event) => { event.stopPropagation(); setSelection({ kind: "relationship", id: relationship.id }); }}>
                    <path d={path} fill="none" stroke="transparent" strokeWidth="18" />
                    <path d={path} fill="none" stroke={chosen ? "#6b6f6c" : "#c7cac8"} strokeWidth={chosen ? 2.4 : 1.6} className="transition-colors group-hover:stroke-[#9da19e]" />
                    <circle cx={x1} cy={y1} r={chosen ? 4 : 3} fill="#f7f8f7" stroke={chosen ? "#6b6f6c" : "#c7cac8"} />
                    <circle cx={x2} cy={y2} r={chosen ? 4 : 3} fill="#f7f8f7" stroke={chosen ? "#6b6f6c" : "#c7cac8"} />
                  </g>;
                })}
              </svg>
              {people.map((person) => {
                const Icon = icons[person.icon]; const chosen = selection?.kind === "person" && selection.id === person.id;
                return <button key={person.id} onPointerDown={(event) => startNodeDrag(event, person)} style={{ left: person.x, top: person.y, width: person.size, height: person.size, backgroundColor: person.color }} className={`group absolute z-10 flex touch-none select-none flex-col items-center justify-center rounded-full text-white shadow-[0_12px_30px_rgba(55,45,38,0.16)] transition-shadow ${chosen ? "ring-[5px] ring-white outline outline-2 outline-zinc-800" : "hover:shadow-[0_16px_35px_rgba(55,45,38,0.24)]"}`} aria-label={`${person.name}, ${person.detail}`}>
                  <Icon style={{ width: Math.max(18, person.size * .24), height: Math.max(18, person.size * .24) }} strokeWidth={1.5} />
                  <span style={{ fontSize: Math.max(10, person.size * .115) }} className="mt-1 max-w-[80%] truncate font-semibold">{person.name}</span>
                  {person.size >= 86 && <span style={{ fontSize: Math.max(8, person.size * .085) }} className="mt-0.5 opacity-65">{person.detail}</span>}
                </button>;
              })}
            </div>
          </div>
          <div className="absolute bottom-5 left-5 z-20 flex items-center overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <button onClick={() => setScale((v) => Math.max(.45, v - .1))} className="map-icon"><Minus /></button><span className="w-14 text-center text-xs font-semibold text-zinc-500">{Math.round(scale * 100)}%</span><button onClick={() => setScale((v) => Math.min(1.6, v + .1))} className="map-icon"><Plus /></button><button onClick={() => { setScale(.9); setOffset({x:0,y:0}); }} className="map-icon border-l"><Maximize2 /></button>
          </div>
          <div className="absolute bottom-5 right-5 z-20 rounded-full bg-white/90 px-3 py-2 text-[11px] font-medium text-zinc-400 shadow-sm">Drag to move · Scroll to explore</div>
        </div>

        <aside className="relative hidden w-[310px] shrink-0 overflow-y-auto border-l border-zinc-200 bg-white xl:block">
          {selectedPerson ? <PersonInspector person={selectedPerson} relationships={relationships} people={people} onChange={updateSelected} onLink={() => setLinkFrom(selectedPerson.id)} onRemoveRelationship={(id) => setRelationships((current) => current.filter((item) => item.id !== id))} onDelete={() => { setPeople((current) => current.filter((p) => p.id !== selectedPerson.id)); setRelationships((current) => current.filter((relationship) => relationship.from !== selectedPerson.id && relationship.to !== selectedPerson.id)); setSelection(null); }} /> : selectedRelationship ? <RelationshipInspector relationship={selectedRelationship} people={people} onChange={(patch) => setRelationships((current) => current.map((item) => item.id === selectedRelationship.id ? { ...item, ...patch } : item))} onDelete={() => { setRelationships((current) => current.filter((item) => item.id !== selectedRelationship.id)); setSelection(null); }} /> : <div className="flex h-full flex-col items-center justify-center px-8 text-center"><UsersRound className="mb-4 h-8 w-8 text-zinc-300"/><p className="text-sm font-semibold">Select a person or relationship</p><p className="mt-1 text-xs leading-5 text-zinc-400">Choose a bubble or connection line to see its details.</p></div>}
        </aside>
      </div>
    </section>
  );
}

function PersonInspector({ person, relationships, people, onChange, onLink, onRemoveRelationship, onDelete }: { person: Person; relationships: Relationship[]; people: Person[]; onChange: (patch: Partial<Person>) => void; onLink: () => void; onRemoveRelationship: (id: string) => void; onDelete: () => void }) {
  const related = relationships.filter((relationship) => relationship.from === person.id || relationship.to === person.id);
  const Icon = icons[person.icon];
  return <div>
    <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4"><div><p className="text-sm font-semibold">Person details</p><p className="mt-0.5 text-[11px] text-zinc-400">Make this bubble feel like them</p></div><MoreHorizontal className="h-5 w-5 text-zinc-400" /></div>
    <div className="px-5 py-5">
      <div className="mb-5 flex items-center gap-3"><div style={{backgroundColor: person.color}} className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-md"><Icon className="h-6 w-6" /></div><div className="min-w-0"><input value={person.name} onChange={(e) => onChange({name:e.target.value})} className="w-full border-0 bg-transparent p-0 text-lg font-semibold outline-none"/><input value={person.detail} onChange={(e) => onChange({detail:e.target.value})} className="w-full border-0 bg-transparent p-0 text-xs text-zinc-400 outline-none"/></div></div>
      <InspectorLabel>Icon</InspectorLabel><div className="mb-5 grid grid-cols-5 gap-2">{(Object.keys(icons) as PersonIcon[]).map((name) => { const Choice = icons[name]; return <button key={name} onClick={() => onChange({icon:name})} className={`flex aspect-square items-center justify-center rounded-xl border ${person.icon === name ? "border-zinc-800 bg-zinc-900 text-white" : "border-zinc-200 text-zinc-400 hover:bg-zinc-50"}`}><Choice className="h-4 w-4" /></button>})}</div>
      <InspectorLabel>Bubble colour</InspectorLabel><div className="mb-5 flex flex-wrap gap-2">{colors.map((color) => <button key={color} onClick={() => onChange({color})} style={{backgroundColor:color}} className={`h-7 w-7 rounded-full border-2 border-white shadow-sm ${person.color === color ? "outline outline-2 outline-offset-1 outline-zinc-700" : ""}`} aria-label={`Use ${color}`} />)}</div>
      <div className="mb-5"><div className="mb-2 flex items-center justify-between"><InspectorLabel>Bubble size</InspectorLabel><span className="text-[11px] font-medium text-zinc-400">{person.size}px</span></div><input type="range" min="64" max="148" value={person.size} onChange={(e) => onChange({size:Number(e.target.value)})} className="w-full accent-zinc-800" /></div>
      <div className="mb-3 flex items-center justify-between"><InspectorLabel>Connections</InspectorLabel><button onClick={onLink} className="flex items-center gap-1 text-[11px] font-semibold text-zinc-700"><Link2 className="h-3 w-3"/> Connect</button></div>
      <div className="space-y-2">{related.map((relationship) => { const otherId = relationship.from === person.id ? relationship.to : relationship.from; const other = people.find((p) => p.id === otherId); return <div key={relationship.id} className="flex items-center gap-2 rounded-xl bg-zinc-50 p-2.5"><span style={{backgroundColor:other?.color}} className="h-7 w-7 rounded-full"/><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{other?.name}</p><p className="text-[10px] text-zinc-400">{relationship.type}</p></div><button onClick={() => onRemoveRelationship(relationship.id)} className="text-zinc-300 hover:text-red-500" aria-label="Remove relationship"><X className="h-3.5 w-3.5"/></button></div>})}</div>
      {person.detail === "You" && <div className="mt-5 rounded-2xl border border-zinc-200 p-3.5"><p className="text-xs font-semibold">Relationship with myself</p><p className="mt-1 text-[10px] leading-4 text-zinc-400">A private space for the relationship you have with yourself.</p><div className="mt-3 space-y-2">{["Connection practices", "Reflections", "Linked goals"].map((item) => <button key={item} className="flex w-full items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-[11px] font-medium text-zinc-600"><span>{item}</span><Plus className="h-3 w-3 text-zinc-400" /></button>)}</div></div>}
      <button onClick={onDelete} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-red-100 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5"/>Remove person</button>
      <div className="mt-5 rounded-xl bg-[#f7f5f1] p-3 text-[10px] leading-4 text-zinc-400"><Sparkles className="mr-1 inline h-3 w-3"/> Size and position are yours to define—they don&apos;t imply importance.</div>
    </div>
  </div>;
}

function RelationshipInspector({ relationship, people, onChange, onDelete }: { relationship: Relationship; people: Person[]; onChange: (patch: Partial<Relationship>) => void; onDelete: () => void }) {
  const from = people.find((person) => person.id === relationship.from);
  const to = people.find((person) => person.id === relationship.to);
  return <div>
    <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4"><div><p className="text-sm font-semibold">Relationship details</p><p className="mt-0.5 text-[11px] text-zinc-400">Shared between two people</p></div><Link2 className="h-4 w-4 text-zinc-400" /></div>
    <div className="px-5 py-5">
      <div className="mb-5 flex items-center gap-3"><PersonDot person={from} /><div className="min-w-0 flex-1 text-center"><p className="truncate text-base font-semibold">{from?.name} <span className="font-normal text-zinc-300">↔</span> {to?.name}</p><p className="mt-0.5 text-xs text-zinc-400">{relationship.type}</p></div><PersonDot person={to} /></div>
      <InspectorLabel>Relationship type</InspectorLabel><input value={relationship.type} onChange={(event) => onChange({ type: event.target.value })} className="input mb-5 !py-2.5" />
      <RelationshipSection icon={Heart} title="Connection Practices" addLabel="Add practice"><div className="space-y-2">{relationship.practices.map((practice) => <MockItem key={`${practice.title}-${practice.cadence}`} title={practice.title} detail={practice.cadence} />)}{relationship.practices.length === 0 && <EmptyDetail>Ongoing actions that help this relationship thrive.</EmptyDetail>}</div></RelationshipSection>
      <RelationshipSection icon={BookOpen} title="Reflections" addLabel="Add reflection">{relationship.reflections.map((reflection) => <div key={reflection.date} className="rounded-xl bg-zinc-50 p-3"><p className="text-[11px] leading-5 text-zinc-600">{reflection.text}</p><p className="mt-2 text-[10px] font-medium text-zinc-400">{reflection.date}</p></div>)}{relationship.reflections.length === 0 && <EmptyDetail>Dated notes about how this relationship is going.</EmptyDetail>}</RelationshipSection>
      <RelationshipSection icon={Target} title="Linked Goals" addLabel="Link goal">{relationship.linkedGoals.map((goal) => <MockItem key={goal} title={goal} detail="Goal" />)}{relationship.linkedGoals.length === 0 && <EmptyDetail>No goals linked yet.</EmptyDetail>}</RelationshipSection>
      <RelationshipSection icon={CalendarDays} title="Important Dates" addLabel="Add date">{relationship.importantDates.map((date) => <MockItem key={`${date.label}-${date.date}`} title={date.label} detail={date.date} />)}{relationship.importantDates.length === 0 && <EmptyDetail>No important dates yet.</EmptyDetail>}</RelationshipSection>
      <RelationshipSection icon={StickyNote} title="Notes" addLabel=""><textarea value={relationship.notes} onChange={(event) => onChange({ notes: event.target.value })} placeholder="Add a note about this relationship…" className="input min-h-20 resize-none !py-2.5 text-xs" /></RelationshipSection>
      <button onClick={onDelete} className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-red-100 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5"/>Remove relationship</button>
    </div>
  </div>;
}

function RelationshipSection({ icon: Icon, title, addLabel, children }: { icon: React.ElementType; title: string; addLabel: string; children: React.ReactNode }) {
  return <section className="mb-5 border-t border-zinc-100 pt-4"><div className="mb-2.5 flex items-center justify-between"><div className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-zinc-400"/><p className="text-[11px] font-semibold text-zinc-700">{title}</p></div>{addLabel && <button className="flex items-center gap-1 text-[10px] font-semibold text-zinc-500"><Plus className="h-3 w-3"/>{addLabel}</button>}</div>{children}</section>;
}

function MockItem({ title, detail }: { title: string; detail: string }) { return <div className="rounded-xl bg-zinc-50 px-3 py-2.5"><p className="text-[11px] font-semibold text-zinc-700">{title}</p><p className="mt-0.5 text-[10px] text-zinc-400">{detail}</p></div>; }
function EmptyDetail({ children }: { children: React.ReactNode }) { return <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-2.5 text-[10px] leading-4 text-zinc-400">{children}</p>; }
function PersonDot({ person }: { person?: Person }) { if (!person) return null; const Icon = icons[person.icon]; return <span style={{ backgroundColor: person.color }} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"><Icon className="h-4 w-4" /></span>; }

function InspectorLabel({ children }: { children: React.ReactNode }) { return <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.14em] text-zinc-400">{children}</p>; }
