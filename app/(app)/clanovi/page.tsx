import { searchMembers } from "./actions";
import { MembersTable } from "./members-table";
import { CreateMemberDialog } from "./create-member-dialog";

export const metadata = {
  title: "Članovi — Teretana",
};

export default async function ClanoviPage() {
  const initial = await searchMembers("", { includeArchived: false, page: 0 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Članovi</h1>
          <p className="text-muted-foreground text-sm">
            Pretražite, kreirajte i upravljajte članovima.
          </p>
        </div>
        <CreateMemberDialog />
      </div>

      <MembersTable
        initialRows={initial.rows}
        initialTotal={initial.total}
        pageSize={initial.pageSize}
      />
    </div>
  );
}
