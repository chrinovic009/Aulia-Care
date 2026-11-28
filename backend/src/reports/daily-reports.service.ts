import { BadRequestException, ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, RoleSlug } from '@prisma/client';
import { AuthenticatedActor, ClinicContextService } from '../core/clinic-context.service';
import { clinicDate, clinicDateFromSerial, clinicDaySerial, clinicWallClockToUtc } from '../core/clinic-time';
import { PrismaService } from '../prisma/prisma.service';
import { buildReport, isReportService, Metric, REPORT_SERVICES, ReportData, ReportService } from './daily-report.builder';

const READERS: RoleSlug[] = [RoleSlug.ADMIN, RoleSlug.SUPER_ADMIN];
const SERVICES = Object.keys(REPORT_SERVICES) as ReportService[];
const isoOf = (date: { year: number; month: number; day: number }) => `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
const parseDay = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new BadRequestException('Jour attendu au format AAAA-MM-JJ.');
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
};

/**
 * Daily reports of every service (except the super administration), produced
 * automatically each night for the day before and archived, then read by the
 * administration day by day (pagination) or over a week or a month.
 */
@Injectable()
export class DailyReportsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DailyReportsService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService, private readonly clinicContext: ClinicContextService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.AULIA_DAILY_REPORTS === 'off') return;
    // Hourly: archive yesterday (and catch up the last 7 days) for every establishment.
    const run = () => this.archivePendingDays().catch((error) => this.logger.warn(`Rapports quotidiens : ${(error as Error).message}`));
    setTimeout(run, 60_000).unref?.();
    this.timer = setInterval(run, 60 * 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private async clinicSettings(clinicId: string) {
    const [clinic, policy] = await Promise.all([
      this.prisma.clinic.findUniqueOrThrow({ where: { id: clinicId }, select: { timezone: true, currency: true } }),
      this.prisma.hrPolicy.findUnique({ where: { clinicId }, select: { lateGraceMinutes: true } }),
    ]);
    return { timeZone: clinic.timezone || 'Africa/Lubumbashi', currency: clinic.currency || 'CDF', graceMinutes: policy?.lateGraceMinutes ?? 5 };
  }

  /** Builds (without saving) every service's report for one clinic day. */
  async build(clinicId: string, day: string): Promise<Record<ReportService, ReportData>> {
    const settings = await this.clinicSettings(clinicId);
    const local = parseDay(day);
    const serial = clinicDaySerial(local);
    const start = clinicWallClockToUtc(local, 0, 0, settings.timeZone);
    const end = clinicWallClockToUtc(clinicDateFromSerial(serial + 1), 0, 0, settings.timeZone);
    const result = {} as Record<ReportService, ReportData>;
    for (const service of SERVICES) result[service] = await buildReport(this.prisma, service, { clinicId, start, end, ...settings });
    return result;
  }

  /** Archives a finished day for one clinic (overwrites an earlier archive of the same day). */
  async archive(clinicId: string, day: string) {
    const reports = await this.build(clinicId, day);
    for (const service of SERVICES) {
      const data = reports[service] as unknown as Prisma.InputJsonValue;
      await this.prisma.dailyReport.upsert({
        where: { clinicId_service_day: { clinicId, service, day } },
        create: { clinicId, service, day, data },
        update: { data, generatedAt: new Date() },
      });
    }
    return reports;
  }

  /** Yesterday and the 6 days before, for each clinic, when not archived yet. */
  async archivePendingDays(now = new Date()) {
    const clinics = await this.prisma.clinic.findMany({ select: { id: true, timezone: true } });
    for (const clinic of clinics) {
      const today = clinicDaySerial(clinicDate(now, clinic.timezone || 'Africa/Lubumbashi'));
      const days = Array.from({ length: 7 }, (_, index) => isoOf(clinicDateFromSerial(today - 1 - index)));
      const existing = new Set((await this.prisma.dailyReport.findMany({ where: { clinicId: clinic.id, day: { in: days }, service: 'RECEPTION' }, select: { day: true } })).map((row) => row.day));
      for (const day of days) if (!existing.has(day)) await this.archive(clinic.id, day);
    }
  }

  private async reader(actorInput?: AuthenticatedActor) {
    const actor = await this.clinicContext.requireOperationalActor(actorInput);
    if (!READERS.some((role) => actor.primaryRole === role || actor.roles.includes(role))) throw new ForbiddenException('Rapports réservés à l’administration.');
    return actor;
  }

  /**
   * One service's daily reports, newest first, page by page. Today's report
   * is computed live (« en cours ») and shown first on page 1.
   */
  async list(serviceInput: string, page = 1, pageSize = 7, actorInput?: AuthenticatedActor) {
    const actor = await this.reader(actorInput);
    if (!isReportService(serviceInput)) throw new BadRequestException('Service de rapport inconnu.');
    const settings = await this.clinicSettings(actor.clinicId);
    const today = isoOf(clinicDate(new Date(), settings.timeZone));
    const size = Math.min(Math.max(Math.floor(pageSize) || 7, 1), 31);
    const current = Math.max(Math.floor(page) || 1, 1);
    const where = { clinicId: actor.clinicId, service: serviceInput, day: { lt: today } };
    const [total, rows] = await Promise.all([
      this.prisma.dailyReport.count({ where }),
      this.prisma.dailyReport.findMany({ where, orderBy: { day: 'desc' }, skip: (current - 1) * size, take: size }),
    ]);
    const live = current === 1 ? { day: today, live: true, generatedAt: new Date(), data: (await this.build(actor.clinicId, today))[serviceInput] } : null;
    return {
      service: serviceInput, label: REPORT_SERVICES[serviceInput], page: current, pageSize: size, total, pages: Math.max(1, Math.ceil(total / size)),
      reports: [...(live ? [live] : []), ...rows.map((row) => ({ day: row.day, live: false, generatedAt: row.generatedAt, data: row.data as unknown as ReportData }))],
      services: Object.entries(REPORT_SERVICES).map(([code, label]) => ({ code, label })),
    };
  }

  /** A week or a month: the archived days added up (counts and amounts), with the best and worst days. */
  async period(serviceInput: string, from: string, to: string, actorInput?: AuthenticatedActor) {
    const actor = await this.reader(actorInput);
    if (!isReportService(serviceInput)) throw new BadRequestException('Service de rapport inconnu.');
    parseDay(from); parseDay(to);
    if (to < from) throw new BadRequestException('La fin de la période précède son début.');
    const rows = await this.prisma.dailyReport.findMany({ where: { clinicId: actor.clinicId, service: serviceInput, day: { gte: from, lte: to } }, orderBy: { day: 'asc' }, take: 400 });
    const totals = new Map<string, Metric>();
    const series: Array<{ day: string; metrics: Record<string, number> }> = [];
    for (const row of rows) {
      const data = row.data as unknown as ReportData;
      const values: Record<string, number> = {};
      for (const metric of data.metrics ?? []) {
        values[metric.key] = metric.value;
        const total = totals.get(metric.key) ?? { ...metric, value: 0 };
        total.value = Math.round((total.value + metric.value) * 100) / 100;
        totals.set(metric.key, total);
      }
      series.push({ day: row.day, metrics: values });
    }
    return { service: serviceInput, label: REPORT_SERVICES[serviceInput], from, to, days: rows.length, totals: [...totals.values()], series };
  }

  /** Re-archives a day on request (after a late correction). */
  async regenerate(day: string, actorInput?: AuthenticatedActor) {
    const actor = await this.reader(actorInput);
    const settings = await this.clinicSettings(actor.clinicId);
    if (day >= isoOf(clinicDate(new Date(), settings.timeZone))) throw new BadRequestException('Seul un jour terminé peut être archivé.');
    await this.archive(actor.clinicId, day);
    return { day, archived: true };
  }
}
