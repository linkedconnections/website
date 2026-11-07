---
layout: specification
specification: true
title: Linked Connections v2-alpha
permalink: /specification/2-0-alpha
---

# Linked Connections v2-alpha: Arrow Connections

**Draft specification · 7 November 2026.** The alpha identifier is `2-alpha`; this is
not a stable v2 release. [Linked Connections 1.0](/specification/1-0) remains
available for RDF/JSON-LD consumers.

## Introduction

Like version 1.0, Linked Connections v2 uses the *connection* as its smallest building
block: one ride of a vehicle from a departure stop at a departure time to the next
stop at an arrival time. Connections are ordered by departure time and split in
pages of a reasonable size. A route planner scans over these connections.

Most of the data model is that of [GTFS Schedule](https://gtfs.org/documentation/schedule/reference/),
and wherever a field has the same name and meaning, this specification refers to GTFS
rather than repeat it. Version 2 changes the serialization. Connections and the context needed to plan with
them are published as typed [Apache Arrow](https://arrow.apache.org/docs/format/Columnar.html)
tables, and the entry point is a JSON-LD manifest that describes the dataset and
tells clients where to find every file.

The words **MUST**, **SHOULD** and **MAY** are used as in 1.0: MUST when a client
would otherwise not be able to use the data, SHOULD for good practice that improves
performance or developer experience, MAY for options.

### Resources

| Resource | Purpose |
| --- | --- |
| Manifest (`manifest.jsonld`) | JSON-LD entry point: dataset metadata, legal conditions, and links to all other resources |
| Connections pages | **The data a route planner scans over**: every scheduled ride between two consecutive stops, split in pages that the manifest or the pages themselves link to |
| `stops` | Stop and platform locations, hierarchy and minimum transfer times |
| `trips` | Per trip: route and display names |
| `routes` | Per route: route type and names |
| `transfers` | Exceptions to the default transfer rules |

A **run** is one vehicle trip on one service date, identified by `(tripIdx, serviceDate)`.
Connections that belong to the same run can be ridden without changing vehicles.

## HTTP

Every resource MUST be served with `Access-Control-Allow-Origin: *`, and MUST be
available through GET and HEAD. Servers SHOULD implement thorough caching and
conditional requests: the manifest and any lookup endpoint (see
[Discovering pages](#discovering-pages)) SHOULD have a short cache lifetime, while every
Arrow file SHOULD be cacheable for a long time because its bytes never change (see
[Releases](#releases)).

Media types: `application/ld+json` for the manifest and
`application/vnd.apache.arrow.file` for Arrow files.

## Releases

A *release* is one generation of the dataset. Its `releaseId` MUST be unique and
MUST NOT be reused. All Arrow files named by a manifest belong to one release, and
the bytes behind the URL of an Arrow file, once published, MUST NOT change, however
that URL was found. Only discovery may change: the manifest URL may be updated to
point to a newer release, and a lookup endpoint may redirect to a newer one. This replaces the Memento gateway of 1.0:
a client keeps one manifest for the duration of a query, and thereby always sees a
consistent set of files. Publishers SHOULD keep old releases available as long as
clients or caches may still refer to them, and SHOULD replace the manifest only
after all files of the new release are available.

## Manifest

The manifest is a JSON-LD 1.1 document that uses the
[Linked Connections context](/specification/2-0-alpha/context.jsonld). All of its
terms are defined in the [Linked Connections vocabulary](/specification/2-0-alpha/vocabulary.ttl)
(`lc:`), which also aligns them with Hydra, DCAT and Dublin Core terms. Relative IRIs
are resolved against the URL of the manifest response. Clients MUST follow the IRIs
in the manifest rather than construct file names.

| Property | | Meaning |
| --- | --- | --- |
| `@id` | MUST | IRI of the manifest |
| `@type` | MUST | `Timetable` |
| `schemaVersion` | MUST | `2-alpha` |
| `releaseId` | MUST | Identifier of this release |
| `generatedAt` | SHOULD | Instant of generation (`xsd:dateTime`) |
| `timeZone` | MUST | IANA time zone in which `serviceDate` values are expressed (the GTFS agency timezone) |
| `license`, `rights` | SHOULD (at least one) | IRI of the license, and/or a rights statement such as an attribution, so that the legal conditions for reuse can be discovered. A client can use the data without them |
| `coverageStart`, `coverageEnd` | SHOULD | Half-open interval of departure times covered. Arrivals may fall after `coverageEnd` |
| `stops`, `trips`, `routes`, `transfers` | MUST (`transfers` MAY be omitted when there are none) | One file descriptor each |
| `connections` | MUST | A `ConnectionCollection`, see [Paging](#paging) |
| `realtime` | MAY | GTFS Realtime feeds, see [Linking a feed](#linking-a-feed) |

A **file descriptor** has an `@id` (the IRI of the Arrow file) and MUST contain
`rowCount`, `byteLength`, `sha256` (lowercase hexadecimal SHA-256) and `mediaType`.
`byteLength` and `sha256` describe the file bytes as stored, without any HTTP content
encoding.

```json
{
  "@context": "https://linkedconnections.org/specification/2-0-alpha/context.jsonld",
  "@id": "https://data.example.org/manifest.jsonld",
  "@type": "Timetable",
  "schemaVersion": "2-alpha",
  "releaseId": "timetable-20261107",
  "generatedAt": "2026-11-07T04:00:00Z",
  "timeZone": "Europe/Brussels",
  "license": "https://creativecommons.org/licenses/by/4.0/",
  "coverageStart": "2026-11-07T06:00:00Z",
  "coverageEnd": "2026-11-07T12:00:00Z",
  "stops": {
    "@id": "releases/timetable-20261107/stops.arrow",
    "rowCount": 4,
    "byteLength": 5050,
    "sha256": "b66f1927e039f4f4462569d052f8ef9d15bc93aed628661033aba73b8f0ade91",
    "mediaType": "application/vnd.apache.arrow.file"
  },
  "connections": {
    "@type": "ConnectionCollection",
    "pages": [ { "@id": "releases/timetable-20261107/connections/0001.arrow" } ]
  }
}
```

[Download a complete illustrative manifest](/specification/examples/manifest.jsonld),
with two regions and irregular time pages. Its hashes are placeholders.

## Arrow files

Every `.arrow` resource MUST be an independently readable **Arrow IPC file**
(`ARROW1` framing with a footer, little-endian). IPC streams are not allowed, and
IPC-level compression MUST NOT be used; a server MAY apply HTTP content encoding.

Schema metadata MUST contain `schemaVersion=2-alpha`, `releaseId=<releaseId>` and
`dataset=<schema key>` (see [Schemas](#schemas)). Connections pages additionally MUST
contain `epochSeconds` (decimal), MUST contain `region` when the connections are
partitioned by region, and MAY contain `next` and `previous` (see [Paging](#paging)).

The tables below give the complete ordered baseline. Consumers MUST check the
version, column types and nullability, SHOULD locate columns by name, and MUST ignore
unknown columns. A compatible extension MAY append nullable columns; anything else
requires a new `schemaVersion`.

- **GTFS semantics.** Most columns are GTFS fields under another name, and keep the
  meaning given in the [GTFS Schedule reference](https://gtfs.org/documentation/schedule/reference/).
  See [GTFS correspondence](#gtfs-correspondence). This specification only repeats
  what GTFS does not say.
- Absolute times are POSIX seconds in UTC. Times in connections are `Uint32` offsets
  from the page's `epochSeconds`.
- `serviceDate` is a `Uint32` of the form `YYYYMMDD`: the GTFS *service day*, in the
  manifest's `timeZone`. GTFS times of a service day are measured from "noon minus
  12h" of that day and may exceed 24:00:00, which matters on daylight saving
  transitions. A connection keeps the service date of its run, even when it
  departs on the next calendar day.
- Missing optional values use Arrow null, not empty strings or zero.
- A column named `…Idx` is a zero-based `Int32` row number in the table of the same
  release that the column refers to. `-1` is only allowed where documented.
- A column named `iri` (or `…Iri`) is a global identifier: an absolute HTTP(S) IRI
  chosen by the publisher, that SHOULD follow the
  [Linked Data principles](https://www.w3.org/wiki/LinkedData). It MUST NOT depend on
  the row number. Whether it depends on the release is up to the publisher, see
  [Identifier matching](#identifier-matching). Indices are only valid within one
  release; IRIs are what identifies an entity beyond it.

### GTFS correspondence

| Column | GTFS field |
| --- | --- |
| `connections.tripIdx`, `connections.serviceDate` | `trips.trip_id` (through `trips.iri`) with a service day of `calendar.txt` / `calendar_dates.txt`: together a *run* |
| `connections.departureTimeOffset`, `arrivalTimeOffset` | `stop_times.departure_time` of the departure stop, `arrival_time` of the arrival stop |
| `connections.stopSequence`, `arrivalStopSequence` | `stop_times.stop_sequence` of the departure and arrival stop |
| `connections.pickupType` | `stop_times.pickup_type` of the departure stop |
| `connections.dropOffType` | `stop_times.drop_off_type` of the arrival stop |
| `stops.name`, `lat`, `lon`, `parentIdx` | `stops.stop_name`, `stop_lat`, `stop_lon`, `parent_station` |
| `stops.minTransferTime` | none: the default for a stop; GTFS `transfers.min_transfer_time` overrides it |
| `trips.routeIdx`, `headsign`, `shortName` | `trips.route_id`, `trip_headsign`, `trip_short_name` |
| `routes.shortName`, `longName`, `routeType` | `routes.route_short_name`, `route_long_name`, `route_type` (including extended types) |
| `stops.iri`, `trips.iri`, `routes.iri` | an IRI minted from `stop_id`, `trip_id` and `route_id`, see [Linking a feed](#linking-a-feed) |
| `transfers.*` | the fields of `transfers.txt` with the same name in snake case |

## Connections

A connection is a row of a connections page: the ride of one run from a stop to the
next stop of that run, with the columns needed to scan.

- `departureStopIdx` and `arrivalStopIdx` refer to `stops`; `tripIdx` refers to `trips`.
- `departureTime = epochSeconds + departureTimeOffset`, and similarly for arrival.
  `epochSeconds` MUST NOT be after any departure in the page. Arrival MUST NOT
  precede departure, and offsets MUST NOT overflow `Uint32`. Arrivals may be after
  the end of a page or day, so never take an offset modulo anything.
- `(tripIdx, serviceDate)` identifies the run. `stopSequence` is the GTFS
  `stop_sequence` of the departure stop and `arrivalStopSequence` that of the arrival
  stop, which MUST be greater. Sequences need not be consecutive, and the pair of
  stops of a connection MUST be adjacent in the run. `(tripIdx, serviceDate,
  stopSequence)` is unique.
- `pickupType` and `dropOffType` have the GTFS values: `0` regular, `1` not
  available, `2` must phone the agency, `3` must coordinate with the driver. Values
  2 and 3 MUST NOT be treated as ordinary boarding.

Within a page, connections MUST be sorted ascending by departure time. A connection
with `stopSequence` equal to the `arrivalStopSequence` of another connection of the same
run continues that ride: the traveller stays on board, without transfer time and
without a pickup restriction. A ride may also continue as another run, see
[linked trips](#linked-trips).

For example, with `epochSeconds = 1794031200` (2026-11-07T06:00:00Z):

| departureStopIdx | arrivalStopIdx | departureTimeOffset | arrivalTimeOffset | tripIdx | pickupType | dropOffType | serviceDate | stopSequence | arrivalStopSequence | iri |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 3 | 1800 | 3300 | 2 | 0 | 0 | 20261107 | 1 | 2 | `https://data.example.org/connections/2/20261107/1` |

is a ride that leaves stop 0 at 06:30:00Z and arrives at stop 3 at 06:55:00Z.

## Paging

The connections are split in **pages**, each page one Arrow file. The `connections`
property of the manifest is a `ConnectionCollection` that describes these pages. A
connection MUST be in exactly one page. How pages are cut is up to the publisher, who
can use any combination of the following, and make the choice discoverable to clients:

- **Time partitioning.** Pages can be cut by any rule: a fixed interval (every 6 hours,
  every day), a number of rows, or irregular cut points. A page declares the time
  range of its connections with `minDepartureTime` and `maxDepartureTime` (inclusive),
  and a page for a quiet period can simply be absent. Equal departure times MAY cross
  a page boundary. A publisher that cuts pages on a fixed schedule can declare this so
  that clients compute page URLs (see [Scheduled pagination](#scheduled-pagination)).
- **Region partitioning.** A *region* is a set of stops, identified by an IRI. The
  `regionIri` column of `stops` assigns every departure stop to one region, and a page
  declares its `region`: all its connections depart from stops of that region. The
  publisher chooses how regions are formed, for instance by clustering around hubs,
  by operator or by country. A page MAY declare `arrivalRegions`: the regions of the
  arrival stops of its connections, which allows a backward (arrive-by) scan to find
  its pages. A client without this information has to read all regions.
- **Linked pages.** The pages of one region (or all pages when there are no regions)
  form a sequence in time. Each page MAY link to its neighbours with `next` and
  `previous`: the last departure of a page MUST NOT be after the first departure of
  its `next`. Pages of different regions overlap freely in time.

Clients MUST only rely on what is declared: they MUST NOT assume that pages align
with a clock time, that every period has a page, or that an IRI encodes its contents.

### Discovering pages

The publisher MUST make the pages discoverable using at least one of the following.
Both MAY be offered at the same time, and MUST then agree.

**1. A list.** The collection has `pages`, one entry for each page. An entry MUST have
an `@id`, and SHOULD have the properties of a file descriptor, `epochSeconds`,
`minDepartureTime`, `maxDepartureTime` and, if applicable, `region`, `arrivalRegions`,
`next` and `previous`. Where an entry lacks `minDepartureTime`, `maxDepartureTime`
or `region`, the client reads these from the page. For a departure interval
`[from, to)` a client fetches every page of the relevant regions for which
`maxDepartureTime >= from` and `minDepartureTime < to`, and merges the pages by
absolute departure time.

**2. A search template.** The collection has a `searchTemplate`, an
[RFC 6570](https://www.rfc-editor.org/rfc/rfc6570) URI template, and MUST say how to
use it with a `paginationStrategy`: `ScheduledPagination` or `RedirectPagination`.
When the data is partitioned by region, the variable `region` is expanded with the
region IRI, as found in `stops.regionIri`.

The URL of a page MUST identify immutable content, also when it is found through a
template, so that a cache that holds a page never serves a stale one. How the template
achieves this depends on the strategy:

- With `ScheduledPagination` the client computes the URL of the page itself, so the
  expanded URL is the URL of the file. The template MUST therefore contain a part that
  changes whenever the content does, normally the `releaseId`, as in the example
  below. Refetching the manifest after a new release then leads to new URLs.
- With `RedirectPagination` the template is a lookup endpoint. It MAY be mutable, and
  MAY answer with pages of a newer release than the manifest. It SHOULD have a short
  cache lifetime, and the URL it redirects to MUST identify immutable content. A
  publisher whose lookup does not return the release of the manifest is responsible
  for keeping identifiers and row indices valid across the releases it may answer
  with. Clients SHOULD compare the `releaseId` metadata of a page with the manifest,
  and refetch the manifest when they differ. Binding the template to the release, as
  in the example below, avoids the problem.

#### Scheduled pagination

The pages are cut at predictable instants, so a client can compute the URL of a page
without asking the server. The collection has a `pageInterval`, an `xsd:duration` of
a whole number of seconds (for example `PT6H`), which is the length of a **slot**.

- Slots start at the multiples of the interval since 1970-01-01T00:00:00Z. `PT6H`
  gives slots starting at 00:00, 06:00, 12:00 and 18:00 UTC.
- The page of a slot (and region) contains exactly the connections that depart from
  the start of the slot, inclusive, until the start of the next slot, exclusive. A page
  MUST exist for every slot (and region) between `coverageStart` and `coverageEnd`,
  and is empty when nothing departs, so that a missing page is an error and never
  means "no connections". Its `epochSeconds` SHOULD be the start of the slot.
- To find the page for a time *t*, a client takes the start *s* of the slot that
  contains *t*, and expands the template with the following variables, derived from *s*
  in UTC: `yyyy` (year, four digits), `MM` (month, 01–12), `dd` (day, 01–31), `HH`
  (hour, 00–23), `mm` (minute) and `ss` (second), all zero-padded. The template MUST use
  enough of them to give every slot its own URL.
- The expanded URL is that of an immutable file, so the template MUST contain the
  `releaseId` or another version component (see above).
- Pages MAY carry `next` and `previous`, but a client does not need them.

```json
"connections": {
  "@type": "ConnectionCollection",
  "paginationStrategy": "ScheduledPagination",
  "pageInterval": "PT6H",
  "searchTemplate": "https://data.example.org/releases/timetable-20261107/connections/{yyyy}/{MM}/{dd}/{HH}{?region}"
}
```

A departure at 2026-11-07T08:42:00Z lies in the slot starting at 06:00:00Z, and its
page is
`https://data.example.org/releases/timetable-20261107/connections/2026/11/07/06`. A publisher with busy
periods chooses a shorter interval, as a slot cannot be split in several pages.

#### Redirect pagination

The publisher decides itself how connections are divided over pages. The template has
the variable `departureTime` (an `xsd:dateTime` in UTC, any instant) and, with
regions, `region`. A request for the expanded URL MUST be answered with an HTTP
redirect (preferably 307) to the page of that region that contains the first
connection departing at or after that time, or with a 404 when there is none. The
redirect itself SHOULD have a short cache lifetime. Every
page then MUST carry `next` and `previous` in its Arrow metadata, so that a client can
follow the pages in time from there.

```json
"connections": {
  "@type": "ConnectionCollection",
  "paginationStrategy": "RedirectPagination",
  "searchTemplate": "https://data.example.org/releases/timetable-20261107/connections{?departureTime,region}"
}
```

### Example: region partitioning

A network has two regions, `north` and `south`. The `regionIri` column of `stops`
assigns each stop (other columns omitted):

| row | name | regionIri |
| --- | --- | --- |
| 0 | Alpha | `https://data.example.org/regions/north` |
| 1 | Bravo | `https://data.example.org/regions/north` |
| 2 | Charlie | `https://data.example.org/regions/south` |
| 3 | Delta | `https://data.example.org/regions/south` |

The manifest lists the pages. The north has two pages, cut at an irregular moment,
and the south has one (other descriptor properties omitted):

```json
"connections": {
  "@type": "ConnectionCollection",
  "pages": [
    { "@id": "connections/north-0001.arrow",
      "region": "https://data.example.org/regions/north",
      "arrivalRegions": [ "https://data.example.org/regions/north",
                          "https://data.example.org/regions/south" ],
      "minDepartureTime": "2026-11-07T06:00:00Z",
      "maxDepartureTime": "2026-11-07T08:55:00Z",
      "next": "connections/north-0002.arrow" },
    { "@id": "connections/north-0002.arrow",
      "region": "https://data.example.org/regions/north",
      "arrivalRegions": [ "https://data.example.org/regions/north" ],
      "minDepartureTime": "2026-11-07T09:05:00Z",
      "maxDepartureTime": "2026-11-07T11:40:00Z",
      "previous": "connections/north-0001.arrow" },
    { "@id": "connections/south-0001.arrow",
      "region": "https://data.example.org/regions/south",
      "arrivalRegions": [ "https://data.example.org/regions/south" ],
      "minDepartureTime": "2026-11-07T06:20:00Z",
      "maxDepartureTime": "2026-11-07T11:10:00Z" }
  ]
}
```

A client that leaves from Alpha (row 0) between 08:00Z and 10:00Z reads `regionIri`
of Alpha, and fetches the `north` pages that overlap that interval: both north pages.
A connection of `north-0001` that arrives at Charlie lets the client reach a stop in
the south: from there it also fetches the `south` pages that overlap the part of the
interval it still scans, and merges all pages by departure time. A client that
searches backwards, to arrive at Charlie before 12:00Z, fetches the pages that list
`south` in `arrivalRegions` (`north-0001` and `south-0001`, but not `north-0002`).

With scheduled pagination the same applies, with `region` in the template. For
`{?region}` and the north region, the page of the 06:00Z slot is
`https://data.example.org/releases/timetable-20261107/connections/2026/11/07/06?region=https%3A%2F%2Fdata.example.org%2Fregions%2Fnorth`.

## Other tables

### Stops

A row is a stop, platform or station, with the GTFS meaning. `parentIdx` refers to
the `parent_station` (`-1` for none); the hierarchy MUST be acyclic. Clients SHOULD
use it to group the platforms of a station, while connections keep referring to the
actual platform. Names and coordinates may be unknown. `minTransferTime` is the
default number of seconds needed to change vehicles at this stop. `regionIri` is the
region of the stop (see [Paging](#paging)) and is null when there is no region
partitioning.

### Trips and routes

`trips` rows refer to a route through `routeIdx`. `headsign` and `shortName` are
display names. `routeType` is the GTFS `route_type`; unknown codes are not to be
assumed to be trains.

### Transfers

`transfers` has the semantics of GTFS
[`transfers.txt`](https://gtfs.org/documentation/schedule/reference/#transferstxt) and
overrides the default `minTransferTime` of a stop. `transferType` is `0` recommended,
`1` timed, `2` minimum time, `3` forbidden, `4` in-seat transfer or `5` no in-seat
transfer. For types 0 to 3 `fromStopIdx` and `toStopIdx` MUST be set, and a type `2`
MUST have a `minTransferTime`. A null trip or route selector matches anything, and
for each pair of arriving and departing runs the most specific applicable row is
used, following the GTFS specificity ranking: trips before routes before neither. A
row that names a station applies to its platforms, unless a row names the platform
itself.

#### Linked trips

Trains can be split in two, or joined, while travellers stay on board. Within a run
this is not an issue, but the parts that continue are different trips. They are
linked as in GTFS, with the rows of type `4` and `5` of `transfers.txt`. Both
`fromTripIdx` and `toTripIdx` MUST be set, `fromStopIdx` and `toStopIdx` are optional
and, if set, refer to stops rather than stations, and `minTransferTime` is null.

- **Type `4`** says that the vehicle of the *from* trip continues as the *to* trip. A
  traveller who arrives with the last connection of a run of the from trip MAY
  continue with the first connection of the corresponding run of the to trip, without
  transfer time, and regardless of the pickup and drop-off types at the junction.
  The last stop of the from trip should be close to the first stop of the to trip,
  and the stops need not be the same.
- **Type `5`** says that there is no in-seat transfer between these trips: the
  traveller has to alight, and the regular transfer rules apply.
- A trip MAY be linked to several trips. A train that splits has a row from the
  incoming trip to each of the outgoing trips (one to *n*), and a train that joins has
  a row from each incoming trip to the outgoing trip (*n* to one). The traveller
  chooses on board which of the parts to follow.
- **The corresponding run.** The from run is the run `(fromTripIdx, serviceDate)`.
  Its to run is the run of the to trip that has the earliest first departure that is
  not before the arrival of the last connection of the from run, among the runs with
  the same service date or the next service date (GTFS allows the to trip to run on
  the following service day).
  When there is none, there is no link.
- Publishers MUST model a split or joined train as separate trips, as GTFS does: a
  train A from X to C and a part that splits off at B to D becomes trip A1 (X to B),
  trip A2 (B to C) and trip A3 (B to D), with the following rows.

| fromStopIdx | toStopIdx | transferType | minTransferTime | fromTripIdx | toTripIdx | fromRouteIdx | toRouteIdx |
| --- | --- | --- | --- | --- | --- | --- | --- |
| null | null | 4 | null | 0 (A1) | 1 (A2) | null | null |
| null | null | 4 | null | 0 (A1) | 2 (A3) | null | null |

A `block_id` or a shared train number is not a link: continuity across trips is only
what these rows say.

## Schemas

The schema key is the value of the Arrow metadata `dataset`. Columns appear in
exactly this order. A nullable column requires a validity bitmap when it contains
nulls. The same schemas are available as [schemas.json](/specification/schemas.json).

### `connections`

<p>Schema key: <code>connections</code>.</p>

| Column | Arrow type | Nullable |
| --- | --- | --- |
| `departureStopIdx` | Int32 | no |
| `arrivalStopIdx` | Int32 | no |
| `departureTimeOffset` | Uint32 | no |
| `arrivalTimeOffset` | Uint32 | no |
| `tripIdx` | Int32 | no |
| `pickupType` | Uint8 | no |
| `dropOffType` | Uint8 | no |
| `serviceDate` | Uint32 | no |
| `stopSequence` | Uint32 | no |
| `arrivalStopSequence` | Uint32 | no |
| `iri` | Utf8 | no |

### `stops`

<p>Schema key: <code>stops</code>.</p>

| Column | Arrow type | Nullable |
| --- | --- | --- |
| `name` | Utf8 | yes |
| `lat` | Float64 | yes |
| `lon` | Float64 | yes |
| `parentIdx` | Int32 | no |
| `minTransferTime` | Uint32 | no |
| `iri` | Utf8 | no |
| `regionIri` | Utf8 | yes |

### `trips`

<p>Schema key: <code>trips</code>.</p>

| Column | Arrow type | Nullable |
| --- | --- | --- |
| `routeIdx` | Int32 | no |
| `headsign` | Utf8 | yes |
| `shortName` | Utf8 | yes |
| `iri` | Utf8 | no |

### `routes`

<p>Schema key: <code>routes</code>.</p>

| Column | Arrow type | Nullable |
| --- | --- | --- |
| `shortName` | Utf8 | yes |
| `longName` | Utf8 | yes |
| `routeType` | Int32 | no |
| `iri` | Utf8 | no |

### `transfers`

<p>Schema key: <code>transfers</code>.</p>

| Column | Arrow type | Nullable |
| --- | --- | --- |
| `fromStopIdx` | Int32 | yes |
| `toStopIdx` | Int32 | yes |
| `transferType` | Uint8 | no |
| `minTransferTime` | Uint32 | yes |
| `fromTripIdx` | Int32 | yes |
| `toTripIdx` | Int32 | yes |
| `fromRouteIdx` | Int32 | yes |
| `toRouteIdx` | Int32 | yes |

## Real-time with GTFS Realtime

How to publish real-time information in Arrow is not standardized (see [Not
standardized](#not-standardized-at-this-time)). We assume, however, that
[GTFS Realtime](https://gtfs.org/documentation/realtime/reference/) (GTFS-RT) works
well on top of connections: it is widely produced, it refers to the same identifiers
as GTFS, and it specifies what a delay, a cancellation or a skipped stop means.
Connection times are the scheduled times, and a client applies the feed on top.

### Identifier matching

GTFS and GTFS-RT identify trips, stops and routes with identifiers that are local to
one GTFS dataset: a `trip_id` `T1` only means something inside that dataset. Linked
Connections elevates these local identifiers to global IRIs. The `iri` columns of
`stops`, `trips` and `routes` are the global identifiers of what GTFS names with a
`stop_id`, `trip_id` and `route_id`. The publisher decides how they are minted, and
this specification does not prescribe it. Two typical choices are:

- **Release-scoped IRIs**, such as `https://data.example.org/releases/timetable-20261107/trips/T1`.
  These are safe when the source renumbers or reuses identifiers between GTFS
  versions, but an entity then has a different IRI in every release.
- **Stable IRIs**, such as `https://data.example.org/trips/T1`. These allow
  reconciling data across releases and with other datasets, and let a feed live
  longer than a release. The publisher then guarantees that an IRI keeps denoting the
  same entity: when the source renumbers or reuses identifiers, this needs a
  persistent mapping, not just a template.

A GTFS-RT message contains only the local identifiers. A consumer therefore has to
mint the IRIs again from the fields of the protobuf message, using the strategy that
the publisher documents in the manifest (see [Linking a feed](#linking-a-feed)),
and then match them with the `iri` columns. The minted IRI and the `iri` column are
compared as exact, case-sensitive strings, without any further normalization.
Consumers MUST NOT mint IRIs with a strategy of their own. Other identifiers need no
minting: a run is the minted trip IRI together with the `start_date`, which is the
`serviceDate`, and `stop_sequence` is the `stopSequence` of the run.

### Linking a feed

A manifest MAY have `realtime`: an array of GTFS-RT feeds. Each feed has an `@id`,
which is the URL of the feed, the type `GtfsRealtimeFeed`, and a `mediaType`, normally
`application/x-protobuf`.

A feed refers to trips, stops and routes with GTFS identifiers, while the tables of the
release identify them with an `iri`. The feed therefore describes how an IRI is minted
from a GTFS-RT entity, with [RFC 6570](https://www.rfc-editor.org/rfc/rfc6570) URI
templates whose variables are the names of GTFS-RT fields:

| Property | Variables | Mints |
| --- | --- | --- |
| `tripTemplate` (MUST) | `trip_id` | `trips.iri` |
| `stopTemplate` (MUST when the feed uses `stop_id`) | `stop_id` | `stops.iri` |
| `routeTemplate` (MUST when the feed uses `route_id`) | `route_id` | `routes.iri` |

```json
"realtime": [
  {
    "@id": "https://data.example.org/gtfs-rt/trip-updates",
    "@type": "GtfsRealtimeFeed",
    "mediaType": "application/x-protobuf",
    "tripTemplate": "https://data.example.org/trips/{trip_id}",
    "stopTemplate": "https://data.example.org/stops/{stop_id}"
  }
]
```

With these templates, `trip_id` `T1` gives `https://data.example.org/trips/T1`. The client
looks this IRI up in the `iri` column of `trips`, which gives the `tripIdx`. Expansion
percent-encodes the values as RFC 6570 does, so a `trip_id` `t/loop` gives
`https://data.example.org/trips/t%2Floop`. A publisher with release-scoped IRIs puts
the release in the fixed part of the template, for instance
`https://data.example.org/releases/timetable-20261107/trips/{trip_id}`: the template
is part of the manifest of that release.

The templates are the documentation of the minting strategy, and MUST reproduce
exactly the `iri` columns of the release. The publisher is responsible for this, and for
keeping the feed in sync with the release. A strategy that cannot be written as a
template, such as a lookup table, cannot be linked this way.

A feed is not part of the release: its bytes change all the time, so it has no hash
and a short cache lifetime. A feed MAY contain any entity types, and a client takes what
it understands: for routing the `TripUpdate` entities.

### Joining a feed with connections

Expand the templates of the feed, and join on the resulting IRIs, never on the `…Idx`
columns of another release.

| GTFS-RT | Connections |
| --- | --- |
| `TripDescriptor.trip_id` | `tripTemplate` gives the IRI in `trips.iri`, and thereby `tripIdx` |
| `TripDescriptor.start_date` | `serviceDate`. Together with the trip this is the run. It is optional in GTFS-RT, see below |
| `StopTimeUpdate.stop_sequence` | `stopSequence` and `arrivalStopSequence` |
| `StopTimeUpdate.stop_id` | `stopTemplate` gives the IRI in `stops.iri`, when there is no `stop_sequence`. Ignore the update when the stop occurs more than once in the run |
| `StopTimeUpdate.departure` | The connection of the run that departs from that stop |
| `StopTimeUpdate.arrival` | The connection of the run that arrives at that stop |

- **Matching the run.** Use `start_date` when the update has it. GTFS-RT only requires it
  to disambiguate a trip that is so late that it collides with the next day, so it is
  often absent, and updates may be about runs that have not started yet. Without it, the
  candidates are the runs of the trip in the release. Keep the candidates whose
  scheduled time at the updated stop is consistent with the absolute `time` of the
  update, within the delays the client accepts. Accept the update when exactly one run
  remains, and reject it when the match is ambiguous. A `delay` without `time` can only
  be accepted when the trip has one run in the coverage of the release. Never discard
  an update because its run has not started yet.
- The effective time is the scheduled time (`epochSeconds` plus offset) plus the
  `delay`, or the `time` when the feed gives it. A delay applies to the next stops
  until a later update, as defined by GTFS-RT.
- A trip with `schedule_relationship` `CANCELED` cannot be boarded on any connection
  of that run. A stop with `SKIPPED` cannot be used to board or alight, but a traveller
  can stay on board. `NO_DATA` means that the scheduled times apply.
- Added or unscheduled trips have no connections in the release, and are not covered.
- **Frequency-based trips** (`frequencies.txt`) are not covered. Their instances share
  a `trip_id` and `start_date` and differ in `start_time`, which GTFS-RT requires for
  them, also when `exact_times` is 1, and `tripTemplate` does not use `start_time`. A
  publisher that expands such a trip in a release MUST give every instance its own
  trip row and `iri`, and the IRI that `tripTemplate` yields for the `trip_id` MUST NOT
  identify any instance. Updates for these trips then find no match and are ignored.
- Effective departure times differ from the scheduled ones, and so does their order.
  A client fetches pages for a wider interval than the one it scans, by at least the
  largest delay it accepts, and processes connections by their effective departure
  time. The bounds of pages are the scheduled bounds.

## Using the data for route planning

This section is informative.

1. Fetch the manifest and keep it for the whole query. Load `stops` and `transfers`;
   load `trips` and `routes` when needed for transfer rules or labels. Verify
   `sha256` and schema metadata.
2. Select the connections pages for the departure interval (see
   [Discovering pages](#discovering-pages)), and scan connections by absolute
   departure time, as in the Connection Scan Algorithm. Connections with
   equal departure time MAY need to be processed repeatedly until nothing improves.
3. Track on-board continuity by run and `stopSequence`. Boarding honors `pickupType`,
   alighting honors `dropOffType`; changing vehicles needs the applicable transfer
   time, while staying on board needs none.
4. For a pair of trips linked with type `4` (see [linked trips](#linked-trips)): once a
   traveller is on board a from run, the first connection of its to run can be taken
   without transfer time, if it does not depart before the from run arrives. Type `5`
   allows no such thing: the traveller has to alight, and the regular transfer rules
   apply.
5. When a GTFS Realtime feed is linked, apply it as described in [Joining a feed
   with connections](#joining-a-feed-with-connections).
6. Reconstruct journeys from the connections used, and only then look up names.

## Validation

A publisher MUST NOT publish a release with: a numeric reference out of range;
an `iri` that is duplicated within a table; a linked feed whose templates do not
reproduce the `iri` of the entities they identify; a cyclic stop hierarchy; arrival before
departure or offsets that overflow; a page that is not sorted; an
`arrivalStopSequence` that is not greater than `stopSequence`; a connection that
departs from a stop outside the `region` of its page; a transfer of type 4 or 5
without both trips; a scheduled page that contains a connection outside its slot; or a descriptor that is
inconsistent with the bytes it describes (including `epochSeconds`, bounds and row
count).

## Not standardized at this time

The following are useful in practice, but this version does not standardize how to
publish them. A publisher MAY offer them through appended columns or through separate
resources, and SHOULD refer to connections, stops and trips by their `iri`. Clients
ignore what they do not understand, and interoperability is not guaranteed until a
later version specifies them.

- **Real-time information** in an Arrow format. We assume that [GTFS
  Realtime](#real-time-with-gtfs-realtime) works well, and describe how to link and
  join it. Platform changes, forecasts and other real-time data are not standardized.
- **Frequency-based service**: instances of a trip in `frequencies.txt` have to be
  expanded into separate trips, and real-time updates for them are not defined.
- **Accessibility attributes**, such as the GTFS `wheelchair_boarding`,
  `wheelchair_accessible` and `bikes_allowed`.
- Shapes and other geometry, occupancy, train composition and alerts.

## References

- [Apache Arrow columnar and IPC file format](https://arrow.apache.org/docs/format/Columnar.html)
- [JSON-LD 1.1](https://www.w3.org/TR/json-ld11/)
- [URI Template, RFC 6570](https://www.rfc-editor.org/rfc/rfc6570)
- [Linked Connections vocabulary](/specification/2-0-alpha/vocabulary.ttl), aligned with [Hydra](https://www.hydra-cg.com/spec/latest/core/), [DCAT](https://www.w3.org/TR/vocab-dcat-3/) and [Dublin Core terms](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/)
- [GTFS Schedule reference](https://gtfs.org/documentation/schedule/reference/)
