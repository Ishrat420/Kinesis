"use client";

import Link from "next/link";

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
import { saveRelationshipMap } from "./actions";
import type { RelationshipMapData, RelationshipPerson as Person, RelationshipRecord as Relationship } from "@/lib/relationships";

type PersonIcon = "user" | "heart" | "baby" | "cat" | "home";
type Selection = { kind: "person" | "relationship"; id: string } | null;
type PendingConnection = { from: string; to: string; type: string };
type GoalOption = { id: string; name: string; status: string };

const initialPeople: Person[] = [
  { id: "self", name: "", detail: "You", x: 488, y: 250, size: 118, color: "#292524", icon: "user" },
];

const initialRelationships: Relationship[] = [];

const icons = { user: UserRound, heart: Heart, baby: Baby, cat: Cat, home: House };
const colors = ["#292524", "#9a7063", "#c58e52", "#6f7f72", "#7686a7", "#9a6d83", "#aa7866"];

export function RelationshipMap({ goals, userDisplayName, initialData }: { goals: GoalOption[]; userDisplayName: string; initialData: RelationshipMapData }) {
  const startingPeople = initialData.people.length ? initialData.people : initialPeople.map((person) => ({ ...person, name: userDisplayName }));
  const [people, setPeople] = useState(startingPeople);
  const [relationships, setRelationships] = useState(initialData.relationships);
  const [selection, setSelection] = useState<Selection>({ kind: "person", id: "self" });
  const [scale, setScale] = useState(0.9);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [inspectorWidth, setInspectorWidth] = useState(360);
  const canvas = useRef<HTMLDivElement>(null);
  const action = useRef<{ kind: "node" | "pan"; id?: string; x: number; y: number; ox: number; oy: number } | null>(null);

  const skipInitialSave = useRef(true);
  useEffect(() => {
    if (skipInitialSave.current) { skipInitialSave.current = false; return; }
    const timeout = window.setTimeout(() => void saveRelationshipMap({ people, relationships }), 350);
    return () => window.clearTimeout(timeout);
  }, [people, relationships]);

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
  useEffect(() => {
    function cancelOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") { setLinkFrom(null); setPendingConnection(null); }
    }
    window.addEventListener("keydown", cancelOnEscape);
    return () => window.removeEventListener("keydown", cancelOnEscape);
  }, []);

  function relationshipExists(personAId: string, personBId: string) {
    const [firstPersonId, secondPersonId] = [personAId, personBId].sort();
    return relationships.some((relationship) => {
      const [existingFirst, existingSecond] = [relationship.from, relationship.to].sort();
      return existingFirst === firstPersonId && existingSecond === secondPersonId;
    });
  }

  function startNodeDrag(event: ReactPointerEvent, person: Person) {
    event.stopPropagation();
    if (linkFrom) {
      if (linkFrom !== person.id && !relationshipExists(linkFrom, person.id)) {
        setPendingConnection({ from: linkFrom, to: person.id, type: person.detail === "Friend" ? "Friend" : "Relationship" });
      }
      return;
    }
    action.current = { kind: "node", id: person.id, x: event.clientX, y: event.clientY, ox: person.x, oy: person.y };
    setSelection({ kind: "person", id: person.id });
  }
  function createConnection() {
    if (!pendingConnection || relationshipExists(pendingConnection.from, pendingConnection.to)) return;
    const [firstPersonId, secondPersonId] = [pendingConnection.from, pendingConnection.to].sort();
    const relationship: Relationship = { id: crypto.randomUUID(), from: firstPersonId, to: secondPersonId, type: pendingConnection.type || null, practices: [], reflections: [], linkedGoals: [], importantDates: [], notes: "" };
    setRelationships((current) => [...current, relationship]);
    setSelection({ kind: "relationship", id: relationship.id });
    setPendingConnection(null);
    setLinkFrom(null);
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
    setPeople(initialPeople.map((person) => ({ ...person, name: userDisplayName })));
    setRelationships(initialRelationships);
    setOffset({ x: 0, y: 0 });
    setScale(0.9);
    setSelection({ kind: "person", id: "self" });
  }
  function startInspectorResize(event: ReactPointerEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = inspectorWidth;
    const resize = (moveEvent: PointerEvent) => setInspectorWidth(Math.min(640, Math.max(300, startWidth + startX - moveEvent.clientX)));
    const stop = () => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stop);
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

      <div className="relative flex h-[calc(100vh-190px)] min-h-[620px] overflow-hidden rounded-[26px] border border-zinc-200 bg-white shadow-[0_16px_50px_rgba(24,24,27,0.06)]">
        <div className="relative min-w-0 flex-1 overflow-hidden bg-[#f7f8f7]">
          <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(#c9ccca_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="absolute left-5 top-5 z-20 flex items-center gap-2 rounded-xl border border-zinc-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur">
            <span className="px-2 text-xs font-semibold text-zinc-600">My constellation</span><ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
          </div>
          {linkFrom && <div className="absolute left-1/2 top-5 z-30 -translate-x-1/2 rounded-2xl bg-zinc-900 px-5 py-3 text-white shadow-lg"><div className="flex items-start gap-4"><div><p className="text-xs font-semibold">Connect {peopleById.get(linkFrom)?.name} to...</p><p className="mt-0.5 text-[10px] text-zinc-400">Select another person</p></div><button onClick={() => setLinkFrom(null)} aria-label="Cancel connection mode"><X className="h-3.5 w-3.5" /></button></div></div>}

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
                const validTarget = Boolean(linkFrom && linkFrom !== person.id && !relationshipExists(linkFrom, person.id));
                return <button key={person.id} onPointerDown={(event) => startNodeDrag(event, person)} style={{ left: person.x, top: person.y, width: person.size, height: person.size, backgroundColor: person.color }} className={`group absolute z-10 flex touch-none select-none flex-col items-center justify-center rounded-full text-white shadow-[0_12px_30px_rgba(55,45,38,0.16)] transition-all ${chosen ? "ring-[5px] ring-white outline outline-2 outline-zinc-800" : "hover:shadow-[0_16px_35px_rgba(55,45,38,0.24)]"} ${validTarget ? "cursor-pointer ring-4 ring-white/90 outline outline-2 outline-emerald-500/60" : ""} ${linkFrom && !validTarget && linkFrom !== person.id ? "opacity-55" : ""}`} aria-label={`${person.name}, ${person.detail}`}>
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

        {pendingConnection && <ConnectionDialog pending={pendingConnection} people={people} onChange={(type) => setPendingConnection((current) => current ? { ...current, type } : null)} onCancel={() => { setPendingConnection(null); setLinkFrom(null); }} onConnect={createConnection} />}

        <aside style={{ width: inspectorWidth }} className="absolute inset-y-0 right-0 z-30 hidden max-w-[calc(100%-2rem)] shrink-0 overflow-y-auto border-l border-zinc-200 bg-white shadow-[-12px_0_32px_rgba(24,24,27,0.08)] sm:block lg:relative lg:max-w-[55%] lg:shadow-none">
          <button onPointerDown={startInspectorResize} className="absolute inset-y-0 left-0 z-40 w-3 -translate-x-1/2 cursor-col-resize touch-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:bg-zinc-200 hover:after:w-0.5 hover:after:bg-zinc-400" aria-label="Resize relationship details" title="Drag to resize details" />
          {selectedPerson ? <PersonInspectorTabs key={selectedPerson.id} person={selectedPerson} relationships={relationships} people={people} goals={goals} onChangePerson={updateSelected} onChangeRelationship={(id, patch) => setRelationships((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item))} onLink={() => setLinkFrom(selectedPerson.id)} onRemoveRelationship={(id) => setRelationships((current) => current.filter((item) => item.id !== id))} onDeletePerson={() => { setPeople((current) => current.filter((p) => p.id !== selectedPerson.id)); setRelationships((current) => current.filter((relationship) => relationship.from !== selectedPerson.id && relationship.to !== selectedPerson.id)); setSelection(null); }} /> : selectedRelationship ? <RelationshipInspector relationship={selectedRelationship} people={people} goals={goals} onChange={(patch) => setRelationships((current) => current.map((item) => item.id === selectedRelationship.id ? { ...item, ...patch } : item))} onDelete={() => { setRelationships((current) => current.filter((item) => item.id !== selectedRelationship.id)); setSelection(null); }} /> : <div className="flex h-full flex-col items-center justify-center px-8 text-center"><UsersRound className="mb-4 h-8 w-8 text-zinc-300"/><p className="text-sm font-semibold">Select a person or relationship</p><p className="mt-1 text-xs leading-5 text-zinc-400">Choose a bubble or connection line to see its details.</p></div>}
        </aside>
      </div>
    </section>
  );
}

function PersonInspectorTabs({ person, relationships, people, goals, onChangePerson, onChangeRelationship, onLink, onRemoveRelationship, onDeletePerson }: { person: Person; relationships: Relationship[]; people: Person[]; goals: GoalOption[]; onChangePerson: (patch: Partial<Person>) => void; onChangeRelationship: (id: string, patch: Partial<Relationship>) => void; onLink: () => void; onRemoveRelationship: (id: string) => void; onDeletePerson: () => void }) {
  const related = relationships.filter((relationship) => relationship.from === person.id || relationship.to === person.id);
  const self = people.find((item) => item.detail === "You");
  const preferred = related.find((relationship) => relationship.from === self?.id || relationship.to === self?.id) ?? related[0];
  const [tab, setTab] = useState<"person" | "relationship">("person");
  const [relationshipId, setRelationshipId] = useState(preferred?.id ?? "");
  const relationship = related.find((item) => item.id === relationshipId) ?? preferred;
  return <div>
    <div className="sticky top-0 z-20 grid grid-cols-2 border-b border-zinc-200 bg-white px-4 pt-3">
      <InspectorTab active={tab === "person"} onClick={() => setTab("person")}>Person details</InspectorTab>
      <InspectorTab active={tab === "relationship"} disabled={!related.length} onClick={() => setTab("relationship")}>Relationship details</InspectorTab>
    </div>
    {tab === "person" ? <PersonInspector person={person} relationships={relationships} people={people} onChange={onChangePerson} onLink={onLink} onRemoveRelationship={onRemoveRelationship} onDelete={onDeletePerson} /> : relationship ? <><RelationshipChoice person={person} relationship={relationship} relationships={related} people={people} onChange={setRelationshipId} /><RelationshipInspector relationship={relationship} people={people} goals={goals} onChange={(patch) => onChangeRelationship(relationship.id, patch)} onDelete={() => { onRemoveRelationship(relationship.id); setTab("person"); }} /></> : <div className="px-5 py-10 text-center text-xs text-zinc-400">Connect this person to someone to add relationship details.</div>}
  </div>;
}

function InspectorTab({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`border-b-2 px-2 py-3 text-xs font-semibold transition ${active ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-400 hover:text-zinc-700"} disabled:cursor-not-allowed disabled:opacity-40`}>{children}</button>;
}

function RelationshipChoice({ person, relationship, relationships, people, onChange }: { person: Person; relationship: Relationship; relationships: Relationship[]; people: Person[]; onChange: (id: string) => void }) {
  if (relationships.length < 2) return null;
  return <div className="border-b border-zinc-100 bg-zinc-50 px-5 py-3"><label htmlFor="person-relationship" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[.12em] text-zinc-400">Relationship with</label><select id="person-relationship" value={relationship.id} onChange={(event) => onChange(event.target.value)} className="input !rounded-lg !px-3 !py-2 text-xs">{relationships.map((item) => { const otherId = item.from === person.id ? item.to : item.from; return <option key={item.id} value={item.id}>{people.find((candidate) => candidate.id === otherId)?.name ?? "Unknown person"}</option>; })}</select></div>;
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

function RelationshipInspector({ relationship, people, goals, onChange, onDelete }: { relationship: Relationship; people: Person[]; goals: GoalOption[]; onChange: (patch: Partial<Relationship>) => void; onDelete: () => void }) {
  const first = people.find((person) => person.id === relationship.from);
  const second = people.find((person) => person.id === relationship.to);
  const [from, to] = second?.detail === "You" ? [second, first] : [first, second];
  const [adding, setAdding] = useState<"practice" | "reflection" | "date" | "goal" | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  return <div>
    <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4"><div><p className="text-sm font-semibold">Relationship details</p><p className="mt-0.5 text-[11px] text-zinc-400">Shared between two people</p></div><Link2 className="h-4 w-4 text-zinc-400" /></div>
    <div className="px-5 py-5">
      <div className="mb-5 flex items-center gap-3"><PersonDot person={from} /><div className="min-w-0 flex-1 text-center"><p className="truncate text-base font-semibold">{from?.name} <span className="font-normal text-zinc-300">↔</span> {to?.name}</p><p className="mt-0.5 text-xs text-zinc-400">{relationship.type}</p></div><PersonDot person={to} /></div>
      <InspectorLabel>Relationship type</InspectorLabel><input value={relationship.type ?? ""} onChange={(event) => onChange({ type: event.target.value || null })} placeholder="Choose a relationship type" className="input mb-5 !py-2.5" />
      <RelationshipSection icon={Heart} title="Connection Practices" addLabel="Add practice" onAdd={() => setAdding("practice")}><p className="mb-2 text-[10px] leading-4 text-zinc-400">Ongoing behaviours that maintain this relationship.</p>{adding === "practice" && <PracticeForm onCancel={() => setAdding(null)} onSave={(practice) => { onChange({ practices: [...relationship.practices, practice] }); setAdding(null); }} />}<div className="space-y-2">{relationship.practices.map((practice, index) => <DetailItem key={index} title={practice.title} detail={practice.cadence} onDelete={() => onChange({ practices: relationship.practices.filter((_, itemIndex) => itemIndex !== index) })} />)}{relationship.practices.length === 0 && adding !== "practice" && <EmptyDetail>No connection practices yet.</EmptyDetail>}</div></RelationshipSection>
      <RelationshipSection icon={BookOpen} title="Reflections" addLabel="Add reflection" onAdd={() => setAdding("reflection")}>{adding === "reflection" && <ReflectionForm today={today} onCancel={() => setAdding(null)} onSave={(reflection) => { onChange({ reflections: [reflection, ...relationship.reflections] }); setAdding(null); }} />}<div className="space-y-2">{relationship.reflections.map((reflection, index) => <div key={index} className="group relative rounded-xl bg-zinc-50 p-3 pr-9"><p className="text-[11px] leading-5 text-zinc-600">{reflection.text}</p><p className="mt-2 text-[10px] font-medium text-zinc-400">{formatDate(reflection.date)}</p><DeleteItemButton onClick={() => onChange({ reflections: relationship.reflections.filter((_, itemIndex) => itemIndex !== index) })} /></div>)}{relationship.reflections.length === 0 && adding !== "reflection" && <EmptyDetail>Dated notes about how this relationship is going.</EmptyDetail>}</div></RelationshipSection>
      <RelationshipSection icon={CalendarDays} title="Important Dates" addLabel="Add date" onAdd={() => setAdding("date")}><p className="mb-2 text-[10px] leading-4 text-zinc-400">Keep meaningful dates here. Reminders are not sent.</p>{adding === "date" && <ImportantDateForm onCancel={() => setAdding(null)} onSave={(date) => { onChange({ importantDates: [...relationship.importantDates, date] }); setAdding(null); }} />}<div className="space-y-2">{relationship.importantDates.map((date, index) => <DetailItem key={index} title={date.label} detail={formatDate(date.date)} onDelete={() => onChange({ importantDates: relationship.importantDates.filter((_, itemIndex) => itemIndex !== index) })} />)}{relationship.importantDates.length === 0 && adding !== "date" && <EmptyDetail>No important dates yet.</EmptyDetail>}</div></RelationshipSection>
      <RelationshipSection icon={Target} title="Linked Goals" addLabel="Link goal" onAdd={() => setAdding(adding === "goal" ? null : "goal")}>
        {adding === "goal" && <GoalPicker goals={goals} linkedGoalIds={relationship.linkedGoals} onLink={(goalId) => onChange({ linkedGoals: [...relationship.linkedGoals, goalId] })} />}
        <div className="space-y-2">{relationship.linkedGoals.map((goalId) => { const goal = goals.find((item) => item.id === goalId); if (!goal) return null; return <LinkedGoal key={goal.id} goal={goal} onUnlink={() => onChange({ linkedGoals: relationship.linkedGoals.filter((id) => id !== goal.id) })} />; })}{relationship.linkedGoals.every((goalId) => !goals.some((goal) => goal.id === goalId)) && adding !== "goal" && <EmptyDetail>No goals linked yet.</EmptyDetail>}</div>
      </RelationshipSection>
      <RelationshipSection icon={StickyNote} title="Notes" addLabel=""><textarea value={relationship.notes} onChange={(event) => onChange({ notes: event.target.value })} placeholder="Add a note about this relationship…" className="input min-h-20 resize-none !py-2.5 text-xs" /></RelationshipSection>
      <button onClick={onDelete} className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-red-100 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5"/>Remove connection</button>
    </div>
  </div>;
}

function RelationshipSection({ icon: Icon, title, addLabel, onAdd, children }: { icon: React.ElementType; title: string; addLabel: string; onAdd?: () => void; children: React.ReactNode }) {
  return <section className="mb-5 border-t border-zinc-100 pt-4"><div className="mb-2.5 flex items-center justify-between"><div className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-zinc-400"/><p className="text-[11px] font-semibold text-zinc-700">{title}</p></div>{addLabel && <button onClick={onAdd} className="flex items-center gap-1 text-[10px] font-semibold text-zinc-500"><Plus className="h-3 w-3"/>{addLabel}</button>}</div>{children}</section>;
}

function ConnectionDialog({ pending, people, onChange, onCancel, onConnect }: { pending: PendingConnection; people: Person[]; onChange: (type: string) => void; onCancel: () => void; onConnect: () => void }) {
  const from = people.find((person) => person.id === pending.from);
  const to = people.find((person) => person.id === pending.to);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/15 p-4 backdrop-blur-[2px]" onPointerDown={onCancel}>
    <div role="dialog" aria-modal="true" aria-labelledby="connect-dialog-title" onPointerDown={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-[22px] border border-zinc-200 bg-white p-5 shadow-[0_24px_80px_rgba(24,24,27,0.18)]">
      <div className="mb-5 flex items-center gap-3"><PersonDot person={from} /><div className="min-w-0 flex-1"><p id="connect-dialog-title" className="truncate text-base font-semibold">Connect {from?.name} and {to?.name}</p><p className="mt-0.5 text-xs text-zinc-400">Create a relationship between these people</p></div><PersonDot person={to} /></div>
      <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[.14em] text-zinc-400" htmlFor="new-relationship-type">Relationship type</label>
      <select id="new-relationship-type" value={pending.type} onChange={(event) => onChange(event.target.value)} className="input mb-5 appearance-none !py-2.5"><option>Friend</option><option>Partner</option><option>Family</option><option>Parent & child</option><option>Sibling</option><option>Colleague</option><option>Relationship</option></select>
      <div className="flex justify-end gap-2"><button onClick={onCancel} className="map-button">Cancel</button><button onClick={onConnect} className="map-button map-button-dark"><Link2 />Connect</button></div>
    </div>
  </div>;
}

function PracticeForm({ onSave, onCancel }: { onSave: (practice: Relationship["practices"][number]) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [cadence, setCadence] = useState("");
  return <form className="mb-2 space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3" onSubmit={(event) => { event.preventDefault(); if (title.trim() && cadence.trim()) onSave({ title: title.trim(), cadence: cadence.trim() }); }}>
    <input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} className="input !rounded-lg !px-3 !py-2 text-xs" placeholder="Practice, e.g. Sunday walk" aria-label="Practice name" />
    <input required value={cadence} onChange={(event) => setCadence(event.target.value)} className="input !rounded-lg !px-3 !py-2 text-xs" placeholder="Frequency, e.g. Every Sunday" aria-label="Practice frequency" />
    <FormActions onCancel={onCancel} />
  </form>;
}

function ReflectionForm({ today, onSave, onCancel }: { today: string; onSave: (reflection: Relationship["reflections"][number]) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [date, setDate] = useState(today);
  return <form className="mb-2 space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3" onSubmit={(event) => { event.preventDefault(); if (text.trim() && date) onSave({ text: text.trim(), date }); }}>
    <textarea autoFocus required value={text} onChange={(event) => setText(event.target.value)} className="input min-h-20 resize-y !rounded-lg !px-3 !py-2 text-xs" placeholder="How is this relationship going?" aria-label="Reflection" />
    <input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input !rounded-lg !px-3 !py-2 text-xs" aria-label="Reflection date" />
    <FormActions onCancel={onCancel} />
  </form>;
}

function ImportantDateForm({ onSave, onCancel }: { onSave: (date: Relationship["importantDates"][number]) => void; onCancel: () => void }) {
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  return <form className="mb-2 space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3" onSubmit={(event) => { event.preventDefault(); if (label.trim() && date) onSave({ label: label.trim(), date }); }}>
    <input autoFocus required value={label} onChange={(event) => setLabel(event.target.value)} className="input !rounded-lg !px-3 !py-2 text-xs" placeholder="Occasion, e.g. Anniversary" aria-label="Date name" />
    <input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input !rounded-lg !px-3 !py-2 text-xs" aria-label="Important date" />
    <FormActions onCancel={onCancel} />
  </form>;
}

function GoalPicker({ goals, linkedGoalIds, onLink }: { goals: GoalOption[]; linkedGoalIds: string[]; onLink: (goalId: string) => void }) {
  const [expanded, setExpanded] = useState(true);
  const availableGoals = goals.filter((goal) => !linkedGoalIds.includes(goal.id));
  return <div className="mb-2 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm">
    <button type="button" onClick={() => setExpanded((current) => !current)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left text-[10px] font-semibold leading-4 text-zinc-500 hover:bg-zinc-50" aria-expanded={expanded}><span>Choose a goal to link</span><ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} /></button>
    {expanded && (availableGoals.length ? <div className="mt-1 max-h-52 space-y-1 overflow-y-auto">{availableGoals.map((goal) => <button key={goal.id} type="button" onClick={() => { onLink(goal.id); setExpanded(false); }} className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-zinc-50"><span className="truncate text-[11px] font-semibold text-zinc-700">{goal.name}</span><GoalStatus status={goal.status} /></button>)}</div> : <p className="mt-1 rounded-lg bg-zinc-50 px-3 py-2.5 text-[10px] leading-4 text-zinc-400">{goals.length ? "All existing goals are already linked." : "Create a goal on the Goals page before linking it here."}</p>)}
  </div>;
}

function LinkedGoal({ goal, onUnlink }: { goal: GoalOption; onUnlink: () => void }) {
  return <div className="group flex items-center gap-1 rounded-xl bg-zinc-50 p-1.5 pl-3">
    <Link href={`/goals/${goal.id}`} className="min-w-0 flex-1 rounded-lg py-1 hover:text-violet-700"><p className="truncate text-[11px] font-semibold">{goal.name}</p><div className="mt-1"><GoalStatus status={goal.status} /></div></Link>
    <button type="button" onClick={onUnlink} className="rounded-lg p-2 text-zinc-300 transition hover:bg-white hover:text-red-500" aria-label={`Unlink ${goal.name}`} title="Unlink goal"><X className="h-3.5 w-3.5" /></button>
  </div>;
}

function GoalStatus({ status }: { status: string }) {
  const tone = status === "Active" ? "bg-violet-100 text-violet-700" : status === "Finished" ? "bg-emerald-100 text-emerald-700" : status === "Revisit Later" ? "bg-amber-100 text-amber-700" : "bg-zinc-200 text-zinc-600";
  return <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${tone}`}>{status}</span>;
}

function FormActions({ onCancel }: { onCancel: () => void }) { return <div className="flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-zinc-500 hover:bg-white">Cancel</button><button type="submit" className="rounded-lg bg-zinc-900 px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-zinc-800">Save</button></div>; }
function DeleteItemButton({ onClick }: { onClick: () => void }) { return <button type="button" onClick={onClick} className="absolute right-2.5 top-2.5 rounded-md p-1 text-zinc-300 opacity-0 transition hover:bg-white hover:text-red-500 group-hover:opacity-100 focus:opacity-100" aria-label="Delete item"><Trash2 className="h-3 w-3" /></button>; }
function DetailItem({ title, detail, onDelete }: { title: string; detail: string; onDelete: () => void }) { return <div className="group relative rounded-xl bg-zinc-50 px-3 py-2.5 pr-9"><p className="text-[11px] font-semibold text-zinc-700">{title}</p><p className="mt-0.5 text-[10px] text-zinc-400">{detail}</p><DeleteItemButton onClick={onDelete} /></div>; }
function formatDate(value: string) { const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : null; return parsed && !Number.isNaN(parsed.valueOf()) ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(parsed) : value; }

function EmptyDetail({ children }: { children: React.ReactNode }) { return <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-2.5 text-[10px] leading-4 text-zinc-400">{children}</p>; }
function PersonDot({ person }: { person?: Person }) { if (!person) return null; const Icon = icons[person.icon]; return <span style={{ backgroundColor: person.color }} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"><Icon className="h-4 w-4" /></span>; }

function InspectorLabel({ children }: { children: React.ReactNode }) { return <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.14em] text-zinc-400">{children}</p>; }
