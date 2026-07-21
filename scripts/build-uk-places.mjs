#!/usr/bin/env node
/**
 * Builds the bundled UK place centroid dataset used for radius search.
 *
 * This is a BUILD-TIME tool, not a runtime dependency. It runs by hand, writes
 * `packages/domain/src/uk-places.generated.json`, and that committed file is the
 * only thing the product ever reads. JobWarden performs no geocoding request at
 * runtime, so radius search has no external source to be rate-limited by, to go
 * down, or to need a compliance record of its own.
 *
 * Coordinates come from two open sources: Ordnance Survey Open Names served by
 * postcodes.io, under Open Government Licence v3, for Great Britain; and
 * OpenStreetMap served by Nominatim, under ODbL, for Northern Ireland and for
 * names Open Names spells differently. Attribution travels in both generated
 * files' headers and is recorded in docs/architecture/free-tier-services.md.
 *
 *   node scripts/build-uk-places.mjs
 *
 * The place NAMES below are curated deliberately rather than scraped: they are
 * the settlements that actually appear in UK job adverts. The coordinates are
 * never hand-written, because a wrong centroid silently returns wrong jobs and
 * looks exactly like a right one.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const endpoint = "https://api.postcodes.io/places";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "packages/domain/src/uk-places.generated.json");
// A migration rather than a seed file. Seeds run on a local `db reset` and
// never on a production deploy, so the gazetteer has to arrive the same way
// `explore_pathways` does or `uk_places` is empty in production and radius
// search silently returns nothing. The whole file is generated, so re-running
// this script is a clean overwrite; the insert is `on conflict do update`, so
// replaying the migration is safe.
const sqlOutput = path.join(
  root,
  "supabase/migrations/202607220002_uk_places_seed.sql",
);

/**
 * Must stay identical to `normalisePlaceName` in the domain package and to
 * `private.normalise_place_name` in the database. All three answer the same
 * question — "is this the same place?" — and a disagreement between them shows
 * up as a location that matches in one layer and not another.
 */
function normalise(value) {
  return value
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, " ")
    .trim();
}

/**
 * Ranked so an ambiguous name resolves to the settlement a job advert means.
 * "Salford" alone matches a suburban area in Kirklees before it matches the
 * city beside Manchester, so the county disambiguates where it matters.
 */
const typeRank = {
  City: 0,
  Town: 1,
  "Suburban Area": 2,
  Village: 3,
  Hamlet: 4,
  "Other Settlement": 5,
};

/** [name, disambiguating county or district] — the county is optional. */
const places = [
  // Nations and the largest cities first.
  ["London"],
  ["Birmingham", "Birmingham"],
  ["Manchester", "Manchester"],
  ["Leeds", "Leeds"],
  ["Glasgow", "Glasgow City"],
  ["Edinburgh", "City of Edinburgh"],
  ["Liverpool", "Liverpool"],
  ["Bristol", "City of Bristol"],
  ["Sheffield", "Sheffield"],
  ["Cardiff", "Cardiff"],
  ["Belfast", "Belfast"],
  ["Newcastle upon Tyne", "Newcastle upon Tyne"],
  ["Nottingham", "Nottingham"],
  ["Leicester", "Leicester"],
  ["Coventry", "Coventry"],
  ["Bradford", "Bradford"],
  ["Southampton", "Southampton"],
  ["Portsmouth", "Portsmouth"],
  ["Brighton", "Brighton and Hove"],
  ["Plymouth", "Plymouth"],
  ["Stoke-on-Trent", "Stoke-on-Trent"],
  ["Wolverhampton", "Wolverhampton"],
  ["Derby", "Derby"],
  ["Swansea", "Swansea"],
  ["Aberdeen", "Aberdeen City"],
  ["Dundee", "Dundee City"],
  ["Sunderland", "Sunderland"],
  ["Kingston upon Hull", "Kingston upon Hull"],
  ["Milton Keynes", "Milton Keynes"],
  ["Northampton", "Northamptonshire"],
  ["Norwich", "Norfolk"],
  ["Luton", "Luton"],
  ["Reading", "Reading"],
  ["Preston", "Lancashire"],
  ["York", "York"],
  ["Oxford", "Oxfordshire"],
  ["Cambridge", "Cambridgeshire"],
  ["Exeter", "Devon"],
  ["Gloucester", "Gloucestershire"],
  ["Ipswich", "Suffolk"],
  ["Peterborough", "Peterborough"],
  ["Swindon", "Swindon"],
  ["Bournemouth", "Bournemouth, Christchurch and Poole"],
  ["Middlesbrough", "Middlesbrough"],
  ["Blackpool", "Blackpool"],
  ["Bolton", "Bolton"],
  ["Stockport", "Stockport"],
  ["Salford", "Salford"],
  ["Oldham", "Oldham"],
  ["Rochdale", "Rochdale"],
  ["Bury", "Bury"],
  ["Wigan", "Wigan"],
  ["Trafford Park", "Trafford"],
  ["Altrincham", "Trafford"],
  ["Stretford", "Trafford"],
  ["Sale", "Trafford"],
  ["Ashton-under-Lyne", "Tameside"],
  ["Warrington", "Warrington"],
  ["St Helens", "St. Helens"],
  ["Birkenhead", "Wirral"],
  ["Southport", "Southport"],
  ["Bootle", "Sefton"],
  ["Chester", "Cheshire West and Chester"],
  ["Crewe", "Cheshire East"],
  ["Macclesfield", "Cheshire East"],
  ["Wakefield", "Wakefield"],
  ["Huddersfield", "Kirklees"],
  ["Halifax", "Calderdale"],
  ["Dewsbury", "Kirklees"],
  ["Keighley", "Bradford"],
  ["Harrogate", "North Yorkshire"],
  ["Doncaster", "Doncaster"],
  ["Rotherham", "Rotherham"],
  ["Barnsley", "Barnsley"],
  ["Scunthorpe", "North Lincolnshire"],
  ["Grimsby", "North East Lincolnshire"],
  ["Lincoln", "Lincolnshire"],
  ["Chesterfield", "Derbyshire"],
  ["Mansfield", "Nottinghamshire"],
  ["Loughborough", "Leicestershire"],
  ["Corby", "Northamptonshire"],
  ["Kettering", "Northamptonshire"],
  ["Bedford", "Bedford"],
  ["Stevenage", "Hertfordshire"],
  ["Watford", "Hertfordshire"],
  ["St Albans", "Hertfordshire"],
  ["Hemel Hempstead", "Hertfordshire"],
  ["Welwyn Garden City", "Hertfordshire"],
  ["Hatfield", "Hertfordshire"],
  ["Basildon", "Essex"],
  ["Chelmsford", "Essex"],
  ["Colchester", "Essex"],
  ["Southend-on-Sea", "Southend-on-Sea"],
  ["Harlow", "Essex"],
  ["Romford", "Greater London"],
  ["Croydon", "Greater London"],
  ["Bromley", "Greater London"],
  ["Ealing", "Greater London"],
  ["Wembley", "Greater London"],
  ["Enfield", "Greater London"],
  ["Hounslow", "Greater London"],
  ["Kingston upon Thames", "Greater London"],
  ["Richmond", "Greater London"],
  ["Uxbridge", "Greater London"],
  ["Ilford", "Greater London"],
  ["Stratford", "Greater London"],
  ["Canary Wharf", "Greater London"],
  ["Slough", "Slough"],
  ["Maidenhead", "Windsor and Maidenhead"],
  ["Bracknell", "Bracknell Forest"],
  ["Newbury", "West Berkshire"],
  ["Basingstoke", "Hampshire"],
  ["Winchester", "Hampshire"],
  ["Farnborough", "Hampshire"],
  ["Aldershot", "Hampshire"],
  ["Eastleigh", "Hampshire"],
  ["Fareham", "Hampshire"],
  ["Guildford", "Surrey"],
  ["Woking", "Surrey"],
  ["Epsom", "Surrey"],
  ["Redhill", "Surrey"],
  ["Crawley", "West Sussex"],
  ["Horsham", "West Sussex"],
  ["Worthing", "West Sussex"],
  ["Chichester", "West Sussex"],
  ["Eastbourne", "East Sussex"],
  ["Hastings", "East Sussex"],
  ["Maidstone", "Kent"],
  ["Canterbury", "Kent"],
  ["Ashford", "Kent"],
  ["Dartford", "Kent"],
  ["Gillingham", "Gillingham"],
  ["Royal Tunbridge Wells", "Kent"],
  ["Bath", "Bath and North East Somerset"],
  ["Cheltenham", "Gloucestershire"],
  ["Worcester", "Worcestershire"],
  ["Hereford", "Herefordshire"],
  ["Shrewsbury", "Shropshire"],
  ["Telford", "Telford and Wrekin"],
  ["Stafford", "Staffordshire"],
  ["Burton upon Trent", "Staffordshire"],
  ["Tamworth", "Staffordshire"],
  ["Nuneaton", "Warwickshire"],
  ["Rugby", "Warwickshire"],
  ["Warwick", "Warwickshire"],
  ["Royal Leamington Spa", "Warwickshire"],
  ["Redditch", "Worcestershire"],
  ["Solihull", "Solihull"],
  ["Dudley", "Dudley"],
  ["Walsall", "Walsall"],
  ["West Bromwich", "Sandwell"],
  ["Sutton Coldfield", "Birmingham"],
  ["Taunton", "Somerset"],
  ["Yeovil", "Somerset"],
  ["Weston-super-Mare", "North Somerset"],
  ["Salisbury", "Wiltshire"],
  ["Trowbridge", "Wiltshire"],
  ["Poole", "Bournemouth, Christchurch and Poole"],
  ["Weymouth", "Dorset"],
  ["Torquay", "Torquay"],
  ["Barnstaple", "Devon"],
  ["Truro", "Cornwall"],
  ["Newquay", "Cornwall"],
  ["Penzance", "Cornwall"],
  ["Carlisle", "Carlisle"],
  ["Barrow-in-Furness", "Westmorland and Furness"],
  ["Kendal", "Westmorland and Furness"],
  ["Lancaster", "Lancashire"],
  ["Blackburn", "Blackburn"],
  ["Burnley", "Lancashire"],
  ["Chorley", "Lancashire"],
  ["Darlington", "Darlington"],
  ["Durham", "County Durham"],
  ["Gateshead", "Gateshead"],
  ["Hartlepool", "Hartlepool"],
  ["Stockton-on-Tees", "Stockton-on-Tees"],
  ["Redcar", "Redcar and Cleveland"],
  ["Northallerton", "North Yorkshire"],
  ["Scarborough", "North Yorkshire"],
  ["Bury St Edmunds", "Suffolk"],
  ["Lowestoft", "Suffolk"],
  ["Great Yarmouth", "Norfolk"],
  ["King's Lynn", "Norfolk"],
  ["Cambourne", "Cambridgeshire"],
  ["Huntingdon", "Cambridgeshire"],
  ["Aylesbury", "Buckinghamshire"],
  ["High Wycombe", "Buckinghamshire"],
  ["Banbury", "Oxfordshire"],
  ["Abingdon-on-Thames", "Oxfordshire"],
  ["Didcot", "Oxfordshire"],
  // Scotland.
  ["Stirling", "Stirling"],
  ["Perth", "Perth and Kinross"],
  ["Inverness", "Highland"],
  ["Paisley", "Renfrewshire"],
  ["East Kilbride", "South Lanarkshire"],
  ["Livingston", "West Lothian"],
  ["Falkirk", "Falkirk"],
  ["Kirkcaldy", "Fife"],
  ["Dunfermline", "Fife"],
  ["Ayr", "South Ayrshire"],
  ["Greenock", "Inverclyde"],
  ["Motherwell", "North Lanarkshire"],
  ["Hamilton", "South Lanarkshire"],
  ["Cumbernauld", "North Lanarkshire"],
  ["Elgin", "Moray"],
  ["Dumfries", "Dumfries and Galloway"],
  // Wales.
  ["Newport", "Newport"],
  ["Wrexham", "Wrexham"],
  ["Barry", "Vale of Glamorgan"],
  ["Bridgend", "Bridgend"],
  ["Neath", "Neath Port Talbot"],
  ["Port Talbot", "Neath Port Talbot"],
  ["Llanelli", "Carmarthenshire"],
  ["Merthyr Tydfil", "Merthyr Tydfil"],
  ["Caerphilly", "Caerphilly"],
  ["Pontypridd", "Rhondda Cynon Taf"],
  ["Bangor", "Gwynedd"],
  ["Aberystwyth", "Ceredigion"],
  ["Colwyn Bay", "Conwy"],
  ["Rhyl", "Denbighshire"],
  // Northern Ireland.
  ["Londonderry", "Derry City and Strabane"],
  ["Lisburn", "Lisburn and Castlereagh"],
  ["Newry", "Newry, Mourne and Down"],
  ["Bangor", "Ards and North Down"],
  ["Craigavon", "Armagh City, Banbridge and Craigavon"],
  ["Ballymena", "Mid and East Antrim"],
  ["Coleraine", "Causeway Coast and Glens"],
  ["Omagh", "Fermanagh and Omagh"],
  ["Enniskillen", "Fermanagh and Omagh"],
  ["Antrim", "Antrim and Newtownabbey"],
];

const nations = new Set(["England", "Scotland", "Wales", "Northern Ireland"]);

/**
 * Metropolitan settlements report no `county_unitary` and a `district_borough`
 * equal to their own name, so a county hint cannot be a gate: requiring it
 * rejected Manchester, Leeds, Liverpool, and Belfast outright. The hint is a
 * strong preference, and settlement type decides everything it does not.
 *
 * "Salford, Greater Manchester" matches no field on any candidate, and still
 * resolves correctly: the city outranks the two Yorkshire suburban areas that
 * share its name.
 */
function score(result, county) {
  const rank = typeRank[result.local_type] ?? 9;
  const fields = [
    result.county_unitary,
    result.district_borough,
    result.region,
  ].filter((field) => typeof field === "string");
  const hinted =
    county !== undefined &&
    fields.some((field) => field.toLowerCase().includes(county.toLowerCase()));
  return (hinted ? -50 : 0) + rank;
}

async function lookup(name, county) {
  const url = `${endpoint}?q=${encodeURIComponent(name)}&limit=20`;
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const body = await response.json();
  const results = Array.isArray(body.result) ? body.result : [];
  const candidates = results.filter(
    (result) =>
      nations.has(result.country) &&
      Number.isFinite(result.latitude) &&
      Number.isFinite(result.longitude) &&
      // "New Manchester" and "New Leeds" are real villages and are not what a
      // job advert saying "Manchester" means.
      typeof result.name_1 === "string" &&
      result.name_1.toLowerCase() === name.toLowerCase(),
  );
  if (candidates.length === 0) return null;

  const scored = candidates
    .map((result) => ({ result, score: score(result, county) }))
    .toSorted((left, right) => left.score - right.score);
  const best = scored[0];

  // A hint that matches nothing is the dangerous case, not the harmless one.
  // "Londonderry" hinted at Derry matches a real suburban area of Sandwell in
  // the West Midlands. "Bangor" hinted at County Down matches the Welsh city,
  // which is the only Bangor Open Names holds because it covers Great Britain
  // alone. Both resolve, both look exactly like success, and both are wrong.
  //
  // So an unmatched hint always means unresolved here, and the OpenStreetMap
  // fallback — which can be asked "Bangor, Ards and North Down" as one query —
  // gets to answer instead. A hint is therefore load-bearing and must name a
  // district, county, or region the source actually reports.
  if (county !== undefined && best.score >= 0) return null;
  return shape(best.result, name);
}

function shape(result, name) {
  return {
    name,
    canonicalName: result.name_1,
    county: result.county_unitary ?? result.district_borough ?? null,
    region: result.region ?? null,
    nation: result.country,
    outcode: result.outcode ?? null,
    latitude: Number(result.latitude.toFixed(5)),
    longitude: Number(result.longitude.toFixed(5)),
    localType: result.local_type,
  };
}

/**
 * Ordnance Survey Open Names covers Great Britain only, so postcodes.io returns
 * nothing at all for Northern Ireland. JobWarden is UK-wide and `job_locations`
 * has always allowed a Northern Ireland nation, so leaving that gap would mean
 * radius search silently excluding a nation rather than merely covering it less
 * well.
 *
 * OpenStreetMap fills it. Nominatim's usage policy asks for an identifying
 * User-Agent and at most one request a second, both of which a hand-run seed
 * script can honour comfortably. OSM data is ODbL; the attribution travels in
 * the generated file.
 */
/**
 * Settlement feature types. Anything else is a building, a road, or a facility
 * that merely sits inside an area whose name matched.
 */
const settlementTypes = new Set([
  "city",
  "town",
  "village",
  "hamlet",
  "suburb",
  "borough",
  "municipality",
  "administrative",
  "locality",
  "quarter",
  "neighbourhood",
]);

/**
 * Whether a Nominatim result is actually the place that was asked for.
 *
 * Nominatim answers a fuzzy query with its best nearby guess rather than
 * nothing, so "no match" arrives looking like a match. This shipped a real
 * wrong answer once: querying "Omagh, Fermanagh and Omagh" returned the
 * "Fermanagh and Omagh District Council Maintenance Depot" — an industrial site
 * beside Enniskillen, twenty miles from Omagh — and it survived a word-boundary
 * name check because the district's own name contains the town's.
 *
 * So the feature must be a settlement, not a depot, and the town's name must
 * lead or close the feature's name rather than merely appear somewhere inside
 * it. Parent areas in the address fields are deliberately not consulted: a
 * correct result legitimately reports "Greater London" or "Birmingham" there.
 */
function namesTheSamePlace(name, result) {
  const type = String(result.addresstype ?? result.type ?? "");
  if (!settlementTypes.has(type)) return false;
  const wanted = normalise(name);
  const actual = normalise(String(result.name ?? ""));
  if (actual.length === 0) return false;
  return (
    actual === wanted ||
    actual.startsWith(`${wanted} `) ||
    actual.endsWith(` ${wanted}`)
  );
}

async function lookupOpenStreetMap(name, county) {
  // Structured search, not free text. Passing "Omagh, Fermanagh and Omagh" as
  // one query let the district's name pollute the match and returned a council
  // depot beside Enniskillen; `city=Omagh` returns Omagh. The county-qualified
  // query runs first because it is the only thing that separates the two
  // Bangors, and the bare query answers the names no county is needed for.
  const attempts =
    county === undefined
      ? [`city=${encodeURIComponent(name)}`]
      : [
          `city=${encodeURIComponent(name)}&county=${encodeURIComponent(county)}`,
          `city=${encodeURIComponent(name)}`,
        ];

  for (const attempt of attempts) {
    const url =
      "https://nominatim.openstreetmap.org/search" +
      `?${attempt}&countrycodes=gb&format=json&limit=5&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "JobWarden-place-seed/1.0 (build-time UK place centroids)",
      },
    });
    if (!response.ok) throw new Error(`${name}: OSM HTTP ${response.status}`);
    const results = await response.json();
    await new Promise((resume) => setTimeout(resume, 1_100));
    if (!Array.isArray(results)) continue;

    for (const result of results) {
      const address = result.address ?? {};
      if (address.country_code !== "gb") continue;
      if (!namesTheSamePlace(name, result)) continue;
      const latitude = Number(result.lat);
      const longitude = Number(result.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      // Nominatim reports Welsh, Scottish, and Northern Irish states
      // bilingually — "Cymru / Wales", "Northern Ireland / Tuaisceart Éireann"
      // — so an equality check silently drops three of the four nations.
      const state = String(address.state ?? "");
      const nation =
        [...nations].find((candidate) => state.includes(candidate)) ?? null;
      if (nation === null) continue;
      return {
        name,
        canonicalName: String(result.name ?? name),
        county: address.county ?? address.state_district ?? null,
        region: state || null,
        nation,
        outcode: null,
        latitude: Number(latitude.toFixed(5)),
        longitude: Number(longitude.toFixed(5)),
        localType: result.addresstype ?? result.type ?? "Other Settlement",
        source: "openstreetmap",
      };
    }
  }
  return null;
}

/**
 * The database needs the same rows the application bundles. Generating both
 * from one run keeps them from drifting: a hand-maintained SQL seed beside a
 * generated JSON file is two datasets that agree only until someone edits one.
 */
function toSeedSql(dataset) {
  const values = dataset.places
    .map((place) => {
      const quote = (value) =>
        value === null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
      return `  (${quote(place.name)}, ${quote(normalise(place.name))}, ${quote(place.nation)}, ${place.latitude}, ${place.longitude})`;
    })
    .join(",\n");
  return `-- GENERATED by scripts/build-uk-places.mjs on ${dataset.generatedAt}.
-- Do not edit by hand; re-run the script instead.
--
-- Contains OS data (c) Crown copyright and database right and Royal Mail data
-- (c) Royal Mail copyright and database right, via postcodes.io, and
-- OpenStreetMap data (c) OpenStreetMap contributors, ODbL. Open Government
-- Licence v3 applies to the Ordnance Survey and Royal Mail portions.

insert into public.uk_places (name, normalised_name, nation, latitude, longitude)
values
${values}
on conflict (normalised_name, latitude, longitude) do update set
  name = excluded.name,
  nation = excluded.nation;
`;
}

async function main() {
  const resolved = [];
  const missing = [];
  for (const [name, county] of places) {
    let place = null;
    try {
      place = await lookup(name, county);
    } catch (error) {
      missing.push(`${name}: ${error.message}`);
      continue;
    }
    // Deliberately serial and unhurried. This runs by hand, a few hundred
    // times, and there is nothing to gain by leaning on a free public service.
    await new Promise((resume) => setTimeout(resume, 120));

    if (place === null) {
      try {
        place = await lookupOpenStreetMap(name, county);
      } catch (error) {
        missing.push(`${name}: ${error.message}`);
        continue;
      }
    }

    if (place) resolved.push({ source: "os-open-names", ...place });
    else missing.push(county ? `${name} (${county})` : name);
  }

  // Deduplicate on the coordinate pair: several curated names legitimately
  // resolve to one settlement, and two entries would double-count it.
  const seen = new Map();
  for (const place of resolved) {
    const key = `${place.latitude},${place.longitude}`;
    if (!seen.has(key)) seen.set(key, place);
  }

  const dataset = {
    $comment:
      "GENERATED by scripts/build-uk-places.mjs. Do not edit by hand. " +
      "Contains OS data (c) Crown copyright and database right, and Royal Mail " +
      "data (c) Royal Mail copyright and database right, via postcodes.io. " +
      "Open Government Licence v3.",
    generatedAt: new Date().toISOString().slice(0, 10),
    places: [...seen.values()].toSorted((left, right) =>
      left.name.localeCompare(right.name, "en-GB"),
    ),
  };

  await writeFile(output, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  await writeFile(sqlOutput, toSeedSql(dataset), "utf8");
  console.info(
    `Wrote ${dataset.places.length} places to ${path.relative(process.cwd(), output)}`,
  );
  console.info(`Wrote seed to ${path.relative(process.cwd(), sqlOutput)}`);
  if (missing.length > 0) {
    console.warn(`Unresolved (${missing.length}): ${missing.join(", ")}`);
  }
}

await main();
