import type { CalendarDate } from "@/lib/time";

import type { Task } from "../domain/task";
import { TaskItem } from "./task-item";

export function TaskList({
  tasks,
  today,
  emptyMessage,
}: {
  readonly tasks: readonly Task[];
  readonly today: CalendarDate;
  readonly emptyMessage?: string;
}) {
  if (tasks.length === 0) {
    return emptyMessage === undefined ? null : (
      <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
    );
  }

  return (
    <ul className="divide-y">
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} today={today} />
      ))}
    </ul>
  );
}
