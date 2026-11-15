import { normalizeDeal, type Deal } from "../crm/deals";
const names = [
  "Loja Aurora",
  "Studio Oliva",
  "Clínica Horizonte",
  "TechNova LTDA",
  "Mariana Costa",
  "Boutique Viva",
  "Acme Corp",
  "Agência Pulse",
  "Grupo Bella",
  "Prime Solar",
  "Vértice Digital",
  "NovaVida Saúde",
  "Casa Amora",
  "MobiLab",
  "Ateliê Rosa",
];
export function demoDeals(): Deal[] {
  return names.map((name, index) => ({
    ...normalizeDeal(
      {
        id: `demo-deal-${index}`,
        contactId: `demo-contact-${(index % 3) + 1}`,
        name,
        stage: (
          ["new", "qualified", "proposal", "negotiation", "won"] as const
        )[Math.floor(index / 3)],
        assignee: ["Ana Martins", "Lucas Ferreira", "Carlos Lima"][index % 3],
        nextAction: [
          "Enviar proposta",
          "Agendar demonstração",
          "Ligar para cliente",
        ][index % 3],
        valueCents: [
          850000, 1200000, 680000, 2800000, 1440000, 920000, 3200000, 1990000,
          870000, 2450000, 1860000, 1330000, 2750000, 1900000, 1680000,
        ][index],
        tags: [],
      },
      index,
    ),
    company: name,
    channel: index % 3 === 1 ? "instagram" : "whatsapp",
    priority: index % 4 === 0 ? "high" : "normal",
    followupAt: new Date(
      Date.now() + ((index % 3) - 1) * 86400000,
    ).toISOString(),
  }));
}
