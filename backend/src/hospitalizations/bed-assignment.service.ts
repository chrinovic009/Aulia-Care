import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type Transaction = Prisma.TransactionClient;

/**
 * Owns the small set of atomic bed mutations. Every caller must already be
 * inside its business transaction, which means a failed admission rolls back
 * both the hospitalization and the bed claim together.
 */
@Injectable()
export class BedAssignmentService {
  async assertAvailable(tx: Transaction, bedId: string, clinicId: string) {
    const bed = await tx.bed.findFirst({
      where: { id: bedId, room: { serviceUnit: { clinicId } } },
      select: { id: true, status: true, hospitalizationId: true },
    });
    if (!bed) throw new BadRequestException('Le lit sélectionné est introuvable dans cet établissement.');
    if (bed.status !== 'FREE' || bed.hospitalizationId) {
      throw new BadRequestException('Le lit sélectionné n’est plus disponible.');
    }
    return bed;
  }

  async claim(tx: Transaction, bedId: string, hospitalizationId: string) {
    const claimed = await tx.bed.updateMany({
      where: { id: bedId, status: 'FREE', hospitalizationId: null },
      data: { status: 'OCCUPIED', hospitalizationId },
    });
    if (claimed.count !== 1) {
      throw new BadRequestException('Le lit sélectionné vient d’être attribué à un autre patient.');
    }
  }

  /** Idempotent release: it only frees the exact current assignment once. */
  async release(tx: Transaction, bedId: string, hospitalizationId: string) {
    return tx.bed.updateMany({
      where: { id: bedId, hospitalizationId, status: 'OCCUPIED' },
      data: { status: 'FREE', hospitalizationId: null },
    });
  }
}
