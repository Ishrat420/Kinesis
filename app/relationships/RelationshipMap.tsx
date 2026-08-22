"use client";

import {
  Baby,
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
type Connection = { id: string; from: string; to: string; label?: string };

const initialPeople: Person[] = [
  { id: "ishrat", name: "Ishrat", detail: "You", x: 488, y: 250, size: 118, color: "#292524", icon: "user" },
  { id: "anj", name: "Anj", detail: "Partner", x: 745, y: 420, size: 96, color: "#9a7063", icon: "heart" },
  { id: "child", name: "Child", detail: "Family", x: 510, y: 520, size: 82, color: "#c58e52", icon: "baby" },
  { id: "sister", name: "Sister", detail: "Family", x: 795, y: 175, size: 88, color: "#6f7f72", icon: "user" },
  { id: "friend", name: "Maya", detail: "Friend", x: 225, y: 295, size: 76, color: "#7686a7", icon: "user" },
  { id: "mum", name: "Mum", detail: "Family", x: 260, y: 520, size: 92, color: "#9a6d83", icon: "home" },
];

const initialConnections: Connection[] = [
  { id: "c1", from: "ishrat", to: "anj", label: "Partner" },
  { id: "c2", from: "ishrat", to: "child" },
  { id: "c3", from: "anj", to: "child" },
  { id: "c4", from: "ishrat", to: "sister", label: "Sister" },
  { id: "c5", from: "ishrat", to: "friend", label: "Friend" },
  { id: "c6", from: "ishrat", to: "mum" },
];

const icons = { user: UserRound, heart: Heart, baby: Baby, cat: Cat, home: House };
const colors = ["#292524", "#9a7063", "#c58e52", "#6f7f72", "#7686a7", "#9a6d83", "#aa7866"];

export function RelationshipMap() {
  const [people, setPeople] = useState(initialPeople);
  const [connections, setConnections] = useState(initialConnections);
  const [selectedId, setSelectedId] = useState("anj");
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

  const selected = people.find((person) => person.id === selectedId) ?? null;
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
      setConnections((current) => [...current, { id: crypto.randomUUID(), from: linkFrom, to: person.id }]);
      setLinkFrom(null);
    }
    setSelectedId(person.id);
  }
  function startPan(event: ReactPointerEvent) {
    if (event.target !== canvas.current) return;
    action.current = { kind: "pan", x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    setSelectedId("");
  }
  function updateSelected(patch: Partial<Person>) {
    setPeople((current) => current.map((person) => person.id === selectedId ? { ...person, ...patch } : person));
  }
  function addPerson() {
    const id = crypto.randomUUID();
    setPeople((current) => [...current, { id, name: "New person", detail: "Relationship", x: 430 - offset.x / scale, y: 340 - offset.y / scale, size: 84, color: "#aa7866", icon: "user" }]);
    setSelectedId(id);
  }
  function reset() {
    setPeople(initialPeople); setConnections(initialConnections); setOffset({ x: 0, y: 0 }); setScale(0.9); setSelectedId("anj");
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
        <div className="relative min-w-0 flex-1 overflow-hidden bg-[#f7f5f1]">
          <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:radial-gradient(#c8c3ba_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="absolute left-5 top-5 z-20 flex items-center gap-2 rounded-xl border border-zinc-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur">
            <span className="px-2 text-xs font-semibold text-zinc-600">My constellation</span><ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
          </div>
          {linkFrom && <div className="absolute left-1/2 top-5 z-30 -translate-x-1/2 rounded-full bg-zinc-900 px-4 py-2 text-xs font-medium text-white shadow-lg">Choose another person to connect <button onClick={() => setLinkFrom(null)} className="ml-2"><X className="inline h-3.5 w-3.5" /></button></div>}

          <div ref={canvas} onPointerDown={startPan} className="absolute inset-0 cursor-grab active:cursor-grabbing touch-none">
            <div style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: "0 0" }} className="absolute inset-0">
              <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                {connections.map((connection) => {
                  const from = peopleById.get(connection.from); const to = peopleById.get(connection.to);
                  if (!from || !to) return null;
                  const x1 = from.x + from.size / 2, y1 = from.y + from.size / 2, x2 = to.x + to.size / 2, y2 = to.y + to.size / 2;
                  return <g key={connection.id}><path d={`M ${x1} ${y1} C ${(x1+x2)/2} ${y1}, ${(x1+x2)/2} ${y2}, ${x2} ${y2}`} fill="none" stroke="#aaa49a" strokeWidth="1.7" /><circle cx={x1} cy={y1} r="3" fill="#f7f5f1" stroke="#aaa49a" /><circle cx={x2} cy={y2} r="3" fill="#f7f5f1" stroke="#aaa49a" /></g>;
                })}
              </svg>
              {people.map((person) => {
                const Icon = icons[person.icon]; const chosen = selectedId === person.id;
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
          {selected ? <Inspector person={selected} connections={connections} people={people} onChange={updateSelected} onLink={() => setLinkFrom(selected.id)} onRemoveConnection={(id) => setConnections((current) => current.filter((item) => item.id !== id))} onDelete={() => { setPeople((current) => current.filter((p) => p.id !== selected.id)); setConnections((current) => current.filter((c) => c.from !== selected.id && c.to !== selected.id)); setSelectedId(""); }} /> : <div className="flex h-full flex-col items-center justify-center px-8 text-center"><UsersRound className="mb-4 h-8 w-8 text-zinc-300"/><p className="text-sm font-semibold">Select a person</p><p className="mt-1 text-xs leading-5 text-zinc-400">Choose a bubble to see details and make it your own.</p></div>}
        </aside>
      </div>
    </section>
  );
}

function Inspector({ person, connections, people, onChange, onLink, onRemoveConnection, onDelete }: { person: Person; connections: Connection[]; people: Person[]; onChange: (patch: Partial<Person>) => void; onLink: () => void; onRemoveConnection: (id: string) => void; onDelete: () => void }) {
  const related = connections.filter((c) => c.from === person.id || c.to === person.id);
  const Icon = icons[person.icon];
  return <div>
    <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4"><div><p className="text-sm font-semibold">Person details</p><p className="mt-0.5 text-[11px] text-zinc-400">Make this bubble feel like them</p></div><MoreHorizontal className="h-5 w-5 text-zinc-400" /></div>
    <div className="px-5 py-5">
      <div className="mb-5 flex items-center gap-3"><div style={{backgroundColor: person.color}} className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-md"><Icon className="h-6 w-6" /></div><div className="min-w-0"><input value={person.name} onChange={(e) => onChange({name:e.target.value})} className="w-full border-0 bg-transparent p-0 text-lg font-semibold outline-none"/><input value={person.detail} onChange={(e) => onChange({detail:e.target.value})} className="w-full border-0 bg-transparent p-0 text-xs text-zinc-400 outline-none"/></div></div>
      <InspectorLabel>Icon</InspectorLabel><div className="mb-5 grid grid-cols-5 gap-2">{(Object.keys(icons) as PersonIcon[]).map((name) => { const Choice = icons[name]; return <button key={name} onClick={() => onChange({icon:name})} className={`flex aspect-square items-center justify-center rounded-xl border ${person.icon === name ? "border-zinc-800 bg-zinc-900 text-white" : "border-zinc-200 text-zinc-400 hover:bg-zinc-50"}`}><Choice className="h-4 w-4" /></button>})}</div>
      <InspectorLabel>Bubble colour</InspectorLabel><div className="mb-5 flex flex-wrap gap-2">{colors.map((color) => <button key={color} onClick={() => onChange({color})} style={{backgroundColor:color}} className={`h-7 w-7 rounded-full border-2 border-white shadow-sm ${person.color === color ? "outline outline-2 outline-offset-1 outline-zinc-700" : ""}`} aria-label={`Use ${color}`} />)}</div>
      <div className="mb-5"><div className="mb-2 flex items-center justify-between"><InspectorLabel>Bubble size</InspectorLabel><span className="text-[11px] font-medium text-zinc-400">{person.size}px</span></div><input type="range" min="64" max="148" value={person.size} onChange={(e) => onChange({size:Number(e.target.value)})} className="w-full accent-zinc-800" /></div>
      <div className="mb-3 flex items-center justify-between"><InspectorLabel>Connections</InspectorLabel><button onClick={onLink} className="flex items-center gap-1 text-[11px] font-semibold text-zinc-700"><Link2 className="h-3 w-3"/> Connect</button></div>
      <div className="space-y-2">{related.map((connection) => { const otherId = connection.from === person.id ? connection.to : connection.from; const other = people.find((p) => p.id === otherId); return <div key={connection.id} className="flex items-center gap-2 rounded-xl bg-zinc-50 p-2.5"><span style={{backgroundColor:other?.color}} className="h-7 w-7 rounded-full"/><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{other?.name}</p><p className="text-[10px] text-zinc-400">{connection.label ?? other?.detail}</p></div><button onClick={() => onRemoveConnection(connection.id)} className="text-zinc-300 hover:text-red-500" aria-label="Remove connection"><X className="h-3.5 w-3.5"/></button></div>})}</div>
      <button onClick={onDelete} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-red-100 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5"/>Remove person</button>
      <div className="mt-5 rounded-xl bg-[#f7f5f1] p-3 text-[10px] leading-4 text-zinc-400"><Sparkles className="mr-1 inline h-3 w-3"/> Size and position are yours to define—they don&apos;t imply importance.</div>
    </div>
  </div>;
}

function InspectorLabel({ children }: { children: React.ReactNode }) { return <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.14em] text-zinc-400">{children}</p>; }
