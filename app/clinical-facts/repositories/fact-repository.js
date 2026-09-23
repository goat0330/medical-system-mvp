export class FactRepository {
  constructor(items = []) { this.items = new Map(items.map((x) => [x.factId, x])); }
  add(item) { this.items.set(item.factId, item); return item; }
  all() { return [...this.items.values()]; }
  byConcept(concept) { return this.all().filter((x) => x.concept === concept); }
  confirmed(concept = null) { return this.all().filter((x) => x.status === 'CONFIRMED' && (!concept || x.concept === concept)); }
  firstConfirmed(concept) { return this.confirmed(concept)[0] || null; }
}
