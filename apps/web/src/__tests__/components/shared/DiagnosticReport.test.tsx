import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DiagnosticReport,
  type DiagnosticReportData,
} from "@/components/shared/DiagnosticReport";

function makeReportData(
  overrides: Partial<DiagnosticReportData> = {}
): DiagnosticReportData {
  return {
    score: 75,
    breakdown: {
      totalAlerts: 8,
      bySeverity: { critical: 2, warning: 3, info: 3 },
      byRule: {
        speed: { count: 2, penalty: 20 },
        length: { count: 3, penalty: 15 },
        overlap: { count: 0, penalty: 0 },
        duration: { count: 0, penalty: 0 },
        proper_noun: { count: 3, penalty: 3 },
      },
      totalPenalty: 38,
    },
    topAlerts: [
      {
        ruleCode: "speed",
        severity: "critical",
        message: "Vitesse de lecture excessive",
        count: 2,
      },
      {
        ruleCode: "length",
        severity: "warning",
        message: "Segments trop longs",
        count: 3,
      },
      {
        ruleCode: "proper_noun",
        severity: "info",
        message: "Noms propres à vérifier",
        count: 3,
      },
    ],
    fileName: "test-file.srt",
    format: "srt",
    segmentCount: 42,
    ...overrides,
  };
}

function extractVisualSnapshot(container: HTMLElement) {
  const content = container.textContent ?? "";
  const scoreLabel = content.includes("Excellent")
    ? "Excellent"
    : content.includes("Non conforme")
      ? "Non conforme"
      : content.includes("Moyen")
        ? "Moyen"
        : content.includes("Bon")
          ? "Bon"
          : null;

  const topAlertTitle =
    screen.queryByText("Alertes restantes")?.textContent ??
    screen.queryByText("Alertes principales")?.textContent ??
    null;

  const severityCounts = Array.from(
    container.querySelectorAll(
      '[aria-label="Répartition des alertes par sévérité"] [role="listitem"] p:first-child'
    )
  ).map((el) => el.textContent);

  const alertBadges = screen
    .queryAllByText(/^(Critique|Avertissement|Information|Info)$/)
    .map((el) => el.textContent);

  return {
    scoreLabel,
    topAlertTitle,
    severityCounts,
    alertBadges,
  };
}

describe("DiagnosticReport", () => {
  describe("affichage du score et badge couleur", () => {
    it("affiche le score global avec /100", () => {
      const data = makeReportData({ score: 75 });
      const { container } = render(<DiagnosticReport data={data} />);
      expect(container.textContent).toContain("75");
      expect(container.textContent).toContain("/100");
    });

    it("affiche le badge Excellent en vert pour un score >= 95", () => {
      const data = makeReportData({
        score: 97,
        breakdown: {
          totalAlerts: 1,
          bySeverity: { critical: 0, warning: 0, info: 1 },
          byRule: {
            speed: { count: 0, penalty: 0 },
            length: { count: 0, penalty: 0 },
            overlap: { count: 0, penalty: 0 },
            duration: { count: 0, penalty: 0 },
            proper_noun: { count: 1, penalty: 1 },
          },
          totalPenalty: 1,
        },
        topAlerts: [
          {
            ruleCode: "proper_noun",
            severity: "info",
            message: "Noms propres à vérifier",
            count: 1,
          },
        ],
      });
      render(<DiagnosticReport data={data} />);
      expect(screen.getByText(/Excellent/)).toBeInTheDocument();
    });

    it("affiche le badge Bon pour un score entre 70 et 89", () => {
      const data = makeReportData({ score: 80 });
      render(<DiagnosticReport data={data} />);
      expect(screen.getByText(/Bon/)).toBeInTheDocument();
    });

    it("n'affiche pas le badge Excellent pour un score de 94", () => {
      const data = makeReportData({ score: 94 });
      render(<DiagnosticReport data={data} />);
      expect(screen.queryByText(/Excellent/)).not.toBeInTheDocument();
      expect(screen.getByText(/Bon/)).toBeInTheDocument();
    });

    it("affiche le badge Moyen pour un score entre 50 et 69", () => {
      const data = makeReportData({ score: 60 });
      render(<DiagnosticReport data={data} />);
      expect(screen.getByText(/Moyen/)).toBeInTheDocument();
    });

    it("affiche le badge Non conforme en rouge pour un score < 50", () => {
      const data = makeReportData({ score: 30 });
      render(<DiagnosticReport data={data} />);
      expect(screen.getByText(/Non conforme/)).toBeInTheDocument();
    });

    it("affiche le badge Non conforme pour un score de 0", () => {
      const data = makeReportData({ score: 0 });
      render(<DiagnosticReport data={data} />);
      expect(screen.getByText(/Non conforme/)).toBeInTheDocument();
    });

    it("affiche le badge Excellent pour un score de 100", () => {
      const data = makeReportData({ score: 100 });
      render(<DiagnosticReport data={data} />);
      expect(screen.getByText(/Excellent/)).toBeInTheDocument();
    });
  });

  describe("répartition des alertes par sévérité", () => {
    it("affiche le nombre d'alertes critiques, warnings et infos", () => {
      const data = makeReportData();
      const { container } = render(<DiagnosticReport data={data} />);

      // Check severity section exists with correct labels
      expect(screen.getByText("Critiques")).toBeInTheDocument();
      expect(screen.getByText("Avertissements")).toBeInTheDocument();
      expect(screen.getByText("Informations")).toBeInTheDocument();

      // Check severity counts within their containers
      const severityList = container.querySelector(
        '[aria-label="Répartition des alertes par sévérité"]'
      );
      expect(severityList).toBeInTheDocument();
      expect(severityList!.textContent).toContain("2");
      expect(severityList!.textContent).toContain("3");
    });

    it("affiche 0 alertes quand le fichier est parfait", () => {
      const data = makeReportData({
        score: 100,
        breakdown: {
          totalAlerts: 0,
          bySeverity: { critical: 0, warning: 0, info: 0 },
          byRule: {
            speed: { count: 0, penalty: 0 },
            length: { count: 0, penalty: 0 },
            overlap: { count: 0, penalty: 0 },
            duration: { count: 0, penalty: 0 },
            proper_noun: { count: 0, penalty: 0 },
          },
          totalPenalty: 0,
        },
        topAlerts: [],
      });
      render(<DiagnosticReport data={data} />);

      // All severity counts should be 0
      const zeros = screen.getAllByText("0");
      expect(zeros.length).toBe(3);
    });
  });

  describe("top 3 alertes les plus impactantes", () => {
    it("affiche les 3 alertes avec type et message", () => {
      const data = makeReportData();
      render(<DiagnosticReport data={data} />);

      expect(
        screen.getByText("Vitesse de lecture excessive")
      ).toBeInTheDocument();
      expect(screen.getByText("Segments trop longs")).toBeInTheDocument();
      expect(
        screen.getByText("Noms propres à vérifier")
      ).toBeInTheDocument();
    });

    it("affiche le nombre de segments concernés par alerte", () => {
      const data = makeReportData();
      render(<DiagnosticReport data={data} />);

      expect(screen.getByText("2 segments concernés")).toBeInTheDocument();
      expect(
        screen.getAllByText("3 segments concernés").length
      ).toBeGreaterThanOrEqual(1);
    });

    it("n'affiche pas la section alertes quand il n'y en a aucune", () => {
      const data = makeReportData({ topAlerts: [] });
      render(<DiagnosticReport data={data} />);

      expect(
        screen.queryByText("Alertes principales")
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("Alertes restantes")
      ).not.toBeInTheDocument();
    });

    it("utilise le singulier quand un seul segment est concerné", () => {
      const data = makeReportData({
        topAlerts: [
          {
            ruleCode: "overlap",
            severity: "critical",
            message: "Chevauchements temporels",
            count: 1,
          },
        ],
      });
      render(<DiagnosticReport data={data} />);

      expect(screen.getByText("1 segment concerné")).toBeInTheDocument();
    });
  });

  describe("score >= 95 : alertes présentées comme informatives", () => {
    it("affiche 'Alertes restantes' au lieu de 'Alertes principales'", () => {
      const data = makeReportData({
        score: 97,
        topAlerts: [
          {
            ruleCode: "proper_noun",
            severity: "info",
            message: "Noms propres à vérifier",
            count: 2,
          },
        ],
      });
      render(<DiagnosticReport data={data} />);

      expect(screen.getByText("Alertes restantes")).toBeInTheDocument();
      expect(
        screen.queryByText("Alertes principales")
      ).not.toBeInTheDocument();
    });

    it("affiche toutes les alertes avec le badge Info même si elles sont critical/warning", () => {
      const data = makeReportData({
        score: 96,
        topAlerts: [
          {
            ruleCode: "speed",
            severity: "warning",
            message: "Vitesse de lecture excessive",
            count: 1,
          },
        ],
      });
      render(<DiagnosticReport data={data} />);

      // Should show "Info" badge, not "Avertissement"
      expect(screen.getByText("Info")).toBeInTheDocument();
      expect(
        screen.queryByText("Avertissement")
      ).not.toBeInTheDocument();
    });
  });

  describe("score < 50 : alertes critiques mises en avant", () => {
    it("affiche le badge Critique sur les alertes critiques", () => {
      const data = makeReportData({
        score: 30,
        topAlerts: [
          {
            ruleCode: "speed",
            severity: "critical",
            message: "Vitesse de lecture excessive",
            count: 5,
          },
          {
            ruleCode: "overlap",
            severity: "critical",
            message: "Chevauchements temporels",
            count: 3,
          },
        ],
      });
      render(<DiagnosticReport data={data} />);

      const critiqueBadges = screen.getAllByText("Critique");
      expect(critiqueBadges.length).toBe(2);
    });
  });

  describe("zones verrouillées (teasers)", () => {
    it("affiche le teaser 'Détail des segments'", () => {
      const data = makeReportData();
      render(<DiagnosticReport data={data} />);

      expect(screen.getByText("Détail des segments")).toBeInTheDocument();
    });

    it("affiche le teaser 'Dossier de preuves PDF'", () => {
      const data = makeReportData();
      render(<DiagnosticReport data={data} />);

      expect(
        screen.getByText("Dossier de preuves PDF")
      ).toBeInTheDocument();
    });

    it("affiche des CTA vers l'inscription dans les teasers", () => {
      const data = makeReportData();
      render(<DiagnosticReport data={data} />);

      const ctaLinks = screen.getAllByText("Créer un compte gratuit");
      expect(ctaLinks.length).toBe(2);
      ctaLinks.forEach((link) => {
        expect(link.closest("a")).toHaveAttribute("href", "/register");
      });
    });
  });

  describe("informations du fichier", () => {
    it("affiche le nom du fichier", () => {
      const data = makeReportData({ fileName: "mon-fichier.srt" });
      render(<DiagnosticReport data={data} />);
      expect(screen.getByText("mon-fichier.srt")).toBeInTheDocument();
    });

    it("affiche le nombre de segments et le format", () => {
      const data = makeReportData({
        segmentCount: 150,
        format: "vtt",
      });
      render(<DiagnosticReport data={data} />);
      expect(
        screen.getByText("150 segments analysés — Format VTT")
      ).toBeInTheDocument();
    });
  });

  describe("bouton nouveau diagnostic", () => {
    it("affiche le bouton quand onReset est fourni", () => {
      const data = makeReportData();
      render(<DiagnosticReport data={data} onReset={() => {}} />);
      expect(
        screen.getByText("Nouveau diagnostic")
      ).toBeInTheDocument();
    });

    it("n'affiche pas le bouton quand onReset n'est pas fourni", () => {
      const data = makeReportData();
      render(<DiagnosticReport data={data} />);
      expect(
        screen.queryByText("Nouveau diagnostic")
      ).not.toBeInTheDocument();
    });

    it("appelle onReset au clic", async () => {
      const user = userEvent.setup();
      const onReset = vi.fn();
      const data = makeReportData();
      render(<DiagnosticReport data={data} onReset={onReset} />);

      await user.click(screen.getByText("Nouveau diagnostic"));
      expect(onReset).toHaveBeenCalledOnce();
    });
  });

  describe("snapshots visuels par niveau de score", () => {
    it("snapshot score excellent (95+)", () => {
      const data = makeReportData({
        score: 97,
        topAlerts: [
          {
            ruleCode: "speed",
            severity: "critical",
            message: "Vitesse de lecture excessive",
            count: 2,
          },
          {
            ruleCode: "length",
            severity: "warning",
            message: "Segments trop longs",
            count: 3,
          },
          {
            ruleCode: "proper_noun",
            severity: "info",
            message: "Noms propres à vérifier",
            count: 3,
          },
        ],
      });
      const { container } = render(<DiagnosticReport data={data} />);

      expect(extractVisualSnapshot(container)).toMatchInlineSnapshot(`
        {
          "alertBadges": [
            "Info",
            "Info",
            "Info",
          ],
          "scoreLabel": "Excellent",
          "severityCounts": [
            "2",
            "3",
            "3",
          ],
          "topAlertTitle": "Alertes restantes",
        }
      `);
    });

    it("snapshot score moyen", () => {
      const data = makeReportData({ score: 60 });
      const { container } = render(<DiagnosticReport data={data} />);

      expect(extractVisualSnapshot(container)).toMatchInlineSnapshot(`
        {
          "alertBadges": [
            "Critique",
            "Avertissement",
            "Information",
          ],
          "scoreLabel": "Moyen",
          "severityCounts": [
            "2",
            "3",
            "3",
          ],
          "topAlertTitle": "Alertes principales",
        }
      `);
    });

    it("snapshot score non conforme", () => {
      const data = makeReportData({ score: 30 });
      const { container } = render(<DiagnosticReport data={data} />);

      expect(extractVisualSnapshot(container)).toMatchInlineSnapshot(`
        {
          "alertBadges": [
            "Critique",
            "Avertissement",
            "Information",
          ],
          "scoreLabel": "Non conforme",
          "severityCounts": [
            "2",
            "3",
            "3",
          ],
          "topAlertTitle": "Alertes principales",
        }
      `);
    });
  });
});
