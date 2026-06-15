"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/members/format";
import { formatPackageMeta } from "@/lib/catalog/format";
import type { CategoryWithTypes } from "@/lib/catalog/types";
import type { TrainingCategory } from "@/lib/db/types";
import { PriceCell } from "./price-cell";
import { AddTypeDialog } from "./add-type-dialog";
import {
  toggleMembershipTypeActive,
  toggleTrainingCategoryActive,
  upsertPrice,
} from "./actions";
import { cn } from "@/lib/utils";

interface CeneClientProps {
  categories: CategoryWithTypes[];
  allCategories: TrainingCategory[];
  isAdmin: boolean;
}

function formatLastEdit(
  updatedAt: string | null | undefined,
  username: string | null | undefined,
  isAdmin: boolean,
): string {
  if (!updatedAt) return "—";
  const date = formatDate(updatedAt);
  if (isAdmin && username) return `${date} · ${username}`;
  return date;
}

export function CeneClient({
  categories,
  allCategories,
  isAdmin,
}: CeneClientProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);

  const activeCategories = categories.filter((c) => c.active || isAdmin);
  const defaultTab = activeCategories[0]?.code ?? categories[0]?.code ?? "";

  async function handleToggleType(id: number, active: boolean) {
    setPending(`type-${id}`);
    const result = await toggleMembershipTypeActive({ id, active });
    setPending(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(active ? "Tip je ponovo aktivan." : "Tip je deaktiviran.");
    router.refresh();
  }

  async function handleToggleCategory(id: number, active: boolean) {
    setPending(`cat-${id}`);
    const result = await toggleTrainingCategoryActive({ id, active });
    setPending(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(active ? "Kategorija je ponovo aktivna." : "Kategorija je deaktivirana.");
    router.refresh();
  }

  if (categories.length === 0 || activeCategories.length === 0) {
    return (
      <div className="space-y-4">
        {isAdmin && (
          <AddTypeDialog categories={allCategories.filter((c) => c.active)} />
        )}
        <p className="text-sm text-muted-foreground">
          Nema definisanih kategorija članarina.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Cene članarina
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Uređujte cene, pakete i kategorije treninga."
              : "Pregled važećih cena članarina."}
          </p>
        </div>
        {isAdmin && (
          <AddTypeDialog categories={allCategories.filter((c) => c.active)} />
        )}
      </div>

      <Tabs key={defaultTab} defaultValue={defaultTab}>
        <TabsList className="h-auto flex-wrap">
          {activeCategories.map((cat) => (
            <TabsTrigger
              key={cat.id}
              value={cat.code}
              className={cn(!cat.active && "opacity-50")}
            >
              {cat.label}
              {!cat.active && isAdmin && (
                <span className="ml-1 text-[10px]">(neaktivna)</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {activeCategories.map((cat) => (
          <TabsContent key={cat.id} value={cat.code} className="space-y-4">
            {isAdmin && !cat.active && (
              <div className="flex items-center justify-between rounded-lg border border-dashed px-4 py-3 text-sm">
                <span className="text-muted-foreground">
                  Ova kategorija je deaktivirana i skrivena od radnika.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending === `cat-${cat.id}`}
                  onClick={() => void handleToggleCategory(cat.id, true)}
                >
                  Reaktiviraj kategoriju
                </Button>
              </div>
            )}

            {isAdmin && cat.active && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  disabled={pending === `cat-${cat.id}`}
                  onClick={() => void handleToggleCategory(cat.id, false)}
                >
                  Deaktiviraj kategoriju
                </Button>
              </div>
            )}

            {cat.types.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nema paketa u ovoj kategoriji.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Naziv</TableHead>
                    <TableHead>Paket</TableHead>
                    <TableHead>Standardna cena</TableHead>
                    {cat.code === "otvoreni" && (
                      <TableHead>Cena sa popustom</TableHead>
                    )}
                    <TableHead>Poslednja izmena</TableHead>
                    {isAdmin && <TableHead className="w-12" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cat.types.map((t) => (
                    <TableRow
                      key={t.id}
                      className={cn(!t.active && "opacity-50")}
                    >
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span>{t.label}</span>
                          <Badge variant="secondary" className="w-fit text-[10px]">
                            {formatPackageMeta(
                              t.is_time_based,
                              t.sessions,
                              t.duration_days,
                            )}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {t.package}
                      </TableCell>
                      <TableCell>
                        <PriceCell
                          membershipTypeId={t.id}
                          isDiscountPrice={false}
                          amount={t.standard?.amount_rsd ?? null}
                          isAdmin={isAdmin}
                          disabled={!t.active}
                          onSave={upsertPrice}
                        />
                      </TableCell>
                      {cat.code === "otvoreni" && (
                        <TableCell>
                          <PriceCell
                            membershipTypeId={t.id}
                            isDiscountPrice={true}
                            amount={t.discount?.amount_rsd ?? null}
                            isAdmin={isAdmin}
                            disabled={!t.active}
                            onSave={upsertPrice}
                          />
                        </TableCell>
                      )}
                      <TableCell className="text-xs text-muted-foreground">
                        {formatLastEdit(
                          t.standard?.updated_at ?? t.discount?.updated_at,
                          t.standard?.updated_by_staff?.username ??
                            t.discount?.updated_by_staff?.username,
                          isAdmin,
                        )}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={pending === `type-${t.id}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Akcije</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {t.active ? (
                                <DropdownMenuItem
                                  onClick={() =>
                                    void handleToggleType(t.id, false)
                                  }
                                >
                                  Deaktiviraj
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() =>
                                    void handleToggleType(t.id, true)
                                  }
                                >
                                  Reaktiviraj
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
