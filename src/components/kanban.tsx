"use client";
import { useNow } from "@/hooks/use-now";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { GripVertical, Clock } from "lucide-react";
import { pipelineStages, money, type Deal } from "@/lib/crm/deals";
import type { Stage } from "@/lib/crm/model";
export function DealCard({
  item,
  open,
  overlay = false,
}: {
  item: Deal;
  open?: () => void;
  overlay?: boolean;
}) {
  const now = useNow();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: overlay });
  return (
    <article
      ref={setNodeRef}
      className={`deal-card ${isDragging ? "dragging" : ""} ${overlay ? "drag-overlay" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-deal-id={item.id}
    >
      <div className="deal-title">
        <button className="deal-open" aria-label={item.name} onClick={open}>
          {item.name}
        </button>
        <button
          {...attributes}
          {...listeners}
          className="drag-handle"
          aria-label={`Mover ${item.name}`}
        >
          <GripVertical size={16} />
        </button>
      </div>
      <strong className="deal-value">{money(item.valueCents ?? 0)}</strong>
      <p>{item.assignee || "Sem responsável"}</p>
      <div className="deal-footer">
        <span className={`channel ${item.channel}`}>
          {item.channel === "whatsapp" ? "WhatsApp" : "Instagram"}
        </span>
        <span
          className={
            item.followupAt && Date.parse(item.followupAt) < now
              ? "overdue"
              : ""
          }
        >
          <Clock size={11} />{" "}
          {item.followupAt
            ? new Date(item.followupAt).toLocaleDateString("pt-BR")
            : "Sem follow-up"}
        </span>
      </div>
      <span className="deal-priority">
        {item.priority === "high"
          ? "Prioridade alta"
          : item.priority === "low"
            ? "Prioridade baixa"
            : ""}
      </span>
    </article>
  );
}
function Column({
  stage,
  items,
  open,
}: {
  stage: (typeof pipelineStages)[number];
  items: Deal[];
  open: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <section
      ref={setNodeRef}
      className={`kanban-column ${isOver ? "drop-target" : ""}`}
      data-stage={stage.id}
      style={{ "--stage-color": stage.color } as React.CSSProperties}
    >
      <h2>
        <span>{stage.name}</span>
        <small>{items.length}</small>
      </h2>
      <p className="column-total">
        {money(
          items.reduce((total, item) => total + (item.valueCents ?? 0), 0),
        )}
      </p>
      <SortableContext
        id={stage.id}
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        {items.map((item) => (
          <DealCard key={item.id} item={item} open={() => open(item.id)} />
        ))}
      </SortableContext>
      {!items.length && (
        <p className="column-empty">Solte uma oportunidade aqui</p>
      )}
    </section>
  );
}
const kanbanKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  if (event.code !== "ArrowRight" && event.code !== "ArrowLeft")
    return sortableKeyboardCoordinates(event, args);
  event.preventDefault();
  const { context, currentCoordinates } = args;
  const current =
    context.over?.data.current?.sortable?.containerId ??
    context.over?.id ??
    context.active?.data.current?.sortable?.containerId;
  const currentIndex = pipelineStages.findIndex(
    (stage) => stage.id === current,
  );
  const next =
    pipelineStages[currentIndex + (event.code === "ArrowRight" ? 1 : -1)];
  const target = next ? context.droppableRects.get(next.id) : null;
  const rect = context.collisionRect;
  if (!target || !rect) return undefined;
  return {
    x: currentCoordinates.x + target.left + 12 - rect.left,
    y: currentCoordinates.y + target.top + 110 - rect.top,
  };
};
export function KanbanBoard({
  items,
  allItems,
  move,
  open,
  disabled,
}: {
  items: Deal[];
  allItems: Deal[];
  move: (id: string, to: Stage, index: number) => void;
  open: (id: string) => void;
  disabled: boolean;
}) {
  const [active, setActive] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: kanbanKeyboardCoordinates,
    }),
  );
  function end(event: DragEndEvent) {
    setActive(null);
    if (disabled || !event.over) return;
    const target = items.find((item) => item.id === event.over?.id);
    const to = (target?.stage ?? event.over.id) as Stage;
    const column = allItems
      .filter((item) => item.stage === to)
      .sort((a, b) => a.position - b.position);
    move(
      String(event.active.id),
      to,
      target
        ? column.findIndex((item) => item.id === target.id)
        : column.length,
    );
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(event) => {
        if (!disabled) setActive(String(event.active.id));
      }}
      onDragCancel={() => setActive(null)}
      onDragEnd={end}
    >
      <div className="kanban-board">
        {pipelineStages.map((stage) => (
          <Column
            key={stage.id}
            stage={stage}
            items={items
              .filter((item) => item.stage === stage.id)
              .sort((a, b) => a.position - b.position)}
            open={open}
          />
        ))}
      </div>
      <DragOverlay>
        {active && items.find((item) => item.id === active) ? (
          <div className="deal-card drag-overlay" aria-hidden="true">
            <strong>{items.find((item) => item.id === active)!.name}</strong>
            <p className="deal-value">
              {money(items.find((item) => item.id === active)!.valueCents ?? 0)}
            </p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

