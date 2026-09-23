/**
 * P0 no longer pretends that a hand-written 103-field subset is the complete
 * 193-item interface dictionary. The user-provided 3-page PDF is the layout
 * reference; production interface field codes remain a later integration item.
 */
export const SETTLEMENT_TEMPLATE_METADATA = Object.freeze({
  referenceFile: "references/医保结算清单（193项）.pdf",
  declaredItemCount: 193,
  pages: 3,
  renderingStatus: "three_page_layout_reproduced",
  productionInterfaceDictionaryStatus: "not_bundled",
  note: "P0 renders the actual three-page business form structure; it does not invent official API field codes.",
});

export const SETTLEMENT_PAGE_SECTIONS = Object.freeze([
  Object.freeze({ page: 1, sections: ["一、基本信息", "二、门诊慢特病诊疗信息", "三、住院诊疗信息", "诊断信息"] }),
  Object.freeze({ page: 2, sections: ["手术及操作", "呼吸机/昏迷", "重症监护", "输血", "护理", "离院方式"] }),
  Object.freeze({ page: 3, sections: ["31天再住院计划", "医护信息", "四、医疗收费信息", "支付信息", "医保支付方式"] }),
]);
