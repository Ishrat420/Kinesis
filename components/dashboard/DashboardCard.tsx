import { Card } from "../ui/Card";

const progressItems = [
  { name: "House Goal", value: "42%" },
  { name: "Exercise", value: "3/4 this week" },
  { name: "Emergency Fund", value: "On track" },
];

export function DashboardCard() {
  return (
    <Card title="Progress">
      <div className="space-y-4">
        {progressItems.map((item) => (
          <div key={item.name} className="flex items-center justify-between">
            <span className="text-sm text-zinc-600">{item.name}</span>
            <span className="font-medium">{item.value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}