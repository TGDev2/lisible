import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DropZone } from '@/components/upload/DropZone';

// Expose the internal onDrop via hoisted mock
const { mockDropzoneState } = vi.hoisted(() => {
  return {
    mockDropzoneState: {
      onDrop: null as ((files: File[], rejections: unknown[]) => void) | null,
      isDragActive: false,
    },
  };
});

vi.mock('react-dropzone', () => ({
  useDropzone: vi.fn((config: { onDrop?: (files: File[], rejections: unknown[]) => void; onDragEnter?: () => void; onDragLeave?: () => void }) => {
    // Capture the onDrop handler for use in tests
    mockDropzoneState.onDrop = config.onDrop ?? null;
    return {
      getRootProps: () => ({
        role: 'button',
        'data-testid': 'dropzone-root',
        onClick: vi.fn(),
        onDragEnter: config.onDragEnter,
        onDragLeave: config.onDragLeave,
      }),
      getInputProps: () => ({
        type: 'file',
        'data-testid': 'dropzone-input',
        onChange: vi.fn(),
      }),
      isDragActive: mockDropzoneState.isDragActive,
    };
  }),
}));

function createSRTFile(name = 'test.srt', content = '1\n00:00:01,000 --> 00:00:02,000\nBonjour monde\n\n') {
  const file = new File([content], name, { type: 'text/plain' });
  // Mock slice().text() to return the first 100 chars (for validation)
  vi.spyOn(file, 'slice').mockReturnValue({
    text: async () => content.slice(0, 100),
  } as Blob);
  return file;
}

function createVTTFile(name = 'test.vtt', content = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nBonjour monde\n\n') {
  const file = new File([content], name, { type: 'text/vtt' });
  vi.spyOn(file, 'slice').mockReturnValue({
    text: async () => content.slice(0, 100),
  } as Blob);
  return file;
}

describe('DropZone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDropzoneState.isDragActive = false;
    mockDropzoneState.onDrop = null;
  });

  describe('rendu état initial (idle)', () => {
    it('affiche l\'icône d\'upload et les instructions', () => {
      render(<DropZone onFileAccepted={vi.fn()} />);
      expect(screen.getByText(/Glissez un fichier ici/)).toBeInTheDocument();
      expect(screen.getByText(/parcourez/)).toBeInTheDocument();
    });

    it('affiche les formats acceptés', () => {
      render(<DropZone onFileAccepted={vi.fn()} />);
      expect(screen.getByText(/\.srt, \.vtt, \.mp4, \.mov/)).toBeInTheDocument();
    });

    it('affiche les limites de taille', () => {
      render(<DropZone onFileAccepted={vi.fn()} />);
      expect(screen.getByText(/500 MB.*vidéo/)).toBeInTheDocument();
    });

    it('contient l\'input de type file', () => {
      render(<DropZone onFileAccepted={vi.fn()} />);
      expect(screen.getByTestId('dropzone-input')).toBeInTheDocument();
    });
  });

  describe('état uploading', () => {
    it('affiche le spinner et le texte Envoi en cours quand state=uploading', () => {
      render(
        <DropZone
          onFileAccepted={vi.fn()}
          state="uploading"
        />
      );
      expect(screen.getByText(/Envoi en cours/)).toBeInTheDocument();
    });

    it('affiche la barre de progression avec le pourcentage', () => {
      render(
        <DropZone
          onFileAccepted={vi.fn()}
          state="uploading"
          uploadProgress={{ percent: 45, loaded: 45 * 1024, total: 100 * 1024 }}
        />
      );
      expect(screen.getByText(/45%/)).toBeInTheDocument();
    });

    it('affiche le bouton Annuler quand onCancel est fourni', () => {
      const onCancel = vi.fn();
      render(
        <DropZone
          onFileAccepted={vi.fn()}
          state="uploading"
          onCancel={onCancel}
        />
      );
      const cancelBtn = screen.getByRole('button', { name: /Annuler l'upload/ });
      expect(cancelBtn).toBeInTheDocument();
    });

    it('appelle onCancel quand le bouton Annuler est cliqué', () => {
      const onCancel = vi.fn();
      render(
        <DropZone
          onFileAccepted={vi.fn()}
          state="uploading"
          onCancel={onCancel}
        />
      );
      const cancelBtn = screen.getByRole('button', { name: /Annuler l'upload/ });
      fireEvent.click(cancelBtn);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('ne rend pas le bouton Annuler si onCancel n\'est pas fourni', () => {
      render(
        <DropZone
          onFileAccepted={vi.fn()}
          state="uploading"
        />
      );
      expect(screen.queryByRole('button', { name: /Annuler/ })).not.toBeInTheDocument();
    });
  });

  describe('état désactivé', () => {
    it('applique la classe d\'opacité quand disabled=true', () => {
      const { container } = render(
        <DropZone onFileAccepted={vi.fn()} disabled />
      );
      const innerZone = container.querySelector('[data-testid="dropzone-root"]');
      expect(innerZone?.className).toContain('opacity-50');
    });
  });

  describe('acceptation de fichiers valides', () => {
    it('appelle onFileAccepted avec un fichier SRT valide', async () => {
      const onFileAccepted = vi.fn();
      render(<DropZone onFileAccepted={onFileAccepted} />);

      // Verify onDrop was captured
      expect(mockDropzoneState.onDrop).toBeTruthy();

      const srtFile = createSRTFile();
      await mockDropzoneState.onDrop!([srtFile], []);

      expect(onFileAccepted).toHaveBeenCalledWith(
        expect.objectContaining({
          file: srtFile,
          type: 'subtitle',
          preview: expect.objectContaining({
            name: 'test.srt',
            extension: 'SRT',
          }),
        })
      );
    });

    it('appelle onFileAccepted avec un fichier VTT valide', async () => {
      const onFileAccepted = vi.fn();
      render(<DropZone onFileAccepted={onFileAccepted} />);

      const vttFile = createVTTFile();
      await mockDropzoneState.onDrop!([vttFile], []);

      expect(onFileAccepted).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'subtitle',
          preview: expect.objectContaining({ extension: 'VTT' }),
        })
      );
    });

    it('affiche le nom et la taille du fichier accepté', async () => {
      const onFileAccepted = vi.fn();
      render(<DropZone onFileAccepted={onFileAccepted} />);

      const srtFile = createSRTFile('mon-fichier.srt');
      await mockDropzoneState.onDrop!([srtFile], []);

      expect(screen.getByText('mon-fichier.srt')).toBeInTheDocument();
    });
  });

  describe('rejet de fichiers invalides', () => {
    it('appelle onError et affiche l\'erreur pour une extension invalide', async () => {
      const onError = vi.fn();
      render(<DropZone onFileAccepted={vi.fn()} onError={onError} />);

      const invalidFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      await mockDropzoneState.onDrop!([invalidFile], []);

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'invalid-extension' })
      );
      expect(screen.getByText(/Erreur/)).toBeInTheDocument();
    });

    it('appelle onError pour un fichier trop volumineux', async () => {
      const onError = vi.fn();
      render(<DropZone onFileAccepted={vi.fn()} onError={onError} />);

      // SRT file > 10MB
      const bigFile = new File(['x'.repeat(100)], 'big.srt', { type: 'text/plain' });
      Object.defineProperty(bigFile, 'size', { value: 11 * 1024 * 1024 });
      await mockDropzoneState.onDrop!([bigFile], []);

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'file-too-large' })
      );
    });

    it('affiche le bouton Réessayer après une erreur', async () => {
      render(<DropZone onFileAccepted={vi.fn()} />);

      const invalidFile = new File(['content'], 'test.exe', { type: 'application/octet-stream' });
      await mockDropzoneState.onDrop!([invalidFile], []);

      expect(screen.getByText(/Réessayer/)).toBeInTheDocument();
    });

    it('retourne à l\'état idle quand Réessayer est cliqué', async () => {
      render(<DropZone onFileAccepted={vi.fn()} />);

      const invalidFile = new File(['content'], 'test.exe', { type: 'application/octet-stream' });
      await mockDropzoneState.onDrop!([invalidFile], []);

      // Error state
      expect(screen.getByText(/Erreur/)).toBeInTheDocument();

      // Click retry
      fireEvent.click(screen.getByText(/Réessayer/));

      // Back to idle
      expect(screen.getByText(/Glissez un fichier ici/)).toBeInTheDocument();
    });

    it('gère le rejet react-dropzone pour fichier trop large', async () => {
      const onError = vi.fn();
      render(<DropZone onFileAccepted={vi.fn()} onError={onError} />);

      // Simulate react-dropzone rejection
      const rejection = {
        file: new File(['content'], 'big.mp4', { type: 'video/mp4' }),
        errors: [{ code: 'file-too-large', message: 'File is too large' }],
      };
      await mockDropzoneState.onDrop!([], [rejection]);

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'file-too-large' })
      );
    });

    it('gère le rejet react-dropzone pour type MIME invalide', async () => {
      const onError = vi.fn();
      render(<DropZone onFileAccepted={vi.fn()} onError={onError} />);

      const rejection = {
        file: new File(['content'], 'doc.docx', { type: 'application/vnd.openxmlformats' }),
        errors: [{ code: 'file-invalid-type', message: 'File type not accepted' }],
      };
      await mockDropzoneState.onDrop!([], [rejection]);

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'invalid-mime' })
      );
    });
  });
});
