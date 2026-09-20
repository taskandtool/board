// How pg hands values back. Ids are bigint columns, which pg returns as
// strings by default; the board's ids never reach 2^53, so they are numbers
// here and comparisons across a form field, a URL and a row agree. Dates
// stay the ten characters Postgres holds, with no timezone shifting.
import pg from "pg";

pg.types.setTypeParser(20, (v: string) => Number(v));
pg.types.setTypeParser(1082, (v: string) => v);
