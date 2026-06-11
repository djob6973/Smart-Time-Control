import { Download, FileText, Table2, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportTablePDF, exportTableCSV, exportTableXLS } from "@/lib/export-table";

export function DownloadMenu({ tableId, filename, title }: {
  tableId: string;
  filename: string;
  title?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-pill gap-1.5">
          <Download className="size-4" />
          Descargar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[156px]">
        <DropdownMenuItem onClick={() => exportTablePDF(tableId, filename, title)}>
          <FileText className="size-4 text-muted-foreground" /> PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportTableCSV(tableId, filename)}>
          <Table2 className="size-4 text-muted-foreground" /> CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportTableXLS(tableId, filename)}>
          <FileSpreadsheet className="size-4 text-muted-foreground" /> Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
