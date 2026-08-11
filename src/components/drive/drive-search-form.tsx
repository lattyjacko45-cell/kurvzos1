import { SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_SEARCH_LENGTH } from "@/lib/drive/normalize";

interface DriveSearchFormProps {
  /** Current term, so the box keeps its value after submit. */
  value: string;
}

/**
 * File-name search.
 *
 * A plain GET form, so it needs no client JavaScript and the result is a
 * shareable, reloadable URL. The term goes to the server as `?q=`, where it is
 * length-capped and escaped before it ever reaches Drive's query syntax.
 *
 * Name only, not content: `fullText` would search inside documents, which the
 * granted metadata scope cannot read and which was not asked for.
 */
export function DriveSearchForm({ value }: DriveSearchFormProps) {
  return (
    <form method="GET" action="/drive" className="flex flex-wrap gap-2">
      <div className="min-w-0 flex-1">
        <Label htmlFor="drive-search" className="sr-only">
          Search Drive files by name
        </Label>

        <Input
          id="drive-search"
          name="q"
          type="search"
          defaultValue={value}
          placeholder="Search file names"
          maxLength={MAX_SEARCH_LENGTH}
          className="h-9"
        />
      </div>

      <Button type="submit" variant="outline" size="sm" className="h-9">
        <SearchIcon />
        Search
      </Button>
    </form>
  );
}
