export class EvidenceRepository {
  constructor(items = []) { this.items = new Map(items.map((x) => [x.evidenceId, x])); }
  add(item) { this.items.set(item.evidenceId, item); return item; }
  all() { return [...this.items.values()]; }
  byId(id) { return this.items.get(id) || null; }
  byConcept(concept) { return this.all().filter((x) => x.concept === concept); }
  byEpisode(episodeId) { return this.all().filter((x) => x.episodeId === episodeId); }
  find(predicate) { return this.all().filter(predicate); }
}
