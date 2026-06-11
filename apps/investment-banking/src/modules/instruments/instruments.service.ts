import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import {
  Instrument, AssetClass, InstrumentStatus,
} from '@tpt/database';

export interface UpsertInstrumentDto {
  isin?: string;
  cusip?: string;
  sedol?: string;
  ticker?: string;
  bloombergId?: string;
  ric?: string;
  displayName: string;
  longName?: string;
  assetClass: AssetClass;
  currency: string;
  exchange?: string;
  countryOfIssue?: string;
  sector?: string;
  industry?: string;
  // Fixed income
  couponRate?: number;
  maturityDate?: Date;
  faceValue?: number;
  couponFrequency?: string;
  creditRating?: string;
  // Derivatives
  derivativeType?: string;
  underlyingId?: string;
  derivativeDetails?: Record<string, unknown>;
  // Sizing
  lotSize?: number;
  priceMultiplier?: number;
}

@Injectable()
export class InstrumentsService {
  constructor(
    @InjectRepository(Instrument)
    private readonly instrumentRepo: Repository<Instrument>,
  ) {}

  async upsert(dto: UpsertInstrumentDto): Promise<Instrument> {
    if (!dto.isin && !dto.cusip && !dto.ticker) {
      throw new BadRequestException('At least one of ISIN, CUSIP, or ticker must be provided');
    }

    // Find existing by any identifier
    let instrument = dto.isin
      ? await this.instrumentRepo.findOne({ where: { isin: dto.isin } })
      : dto.cusip
        ? await this.instrumentRepo.findOne({ where: { cusip: dto.cusip } })
        : null;

    const data: Partial<Instrument> = {
      isin: dto.isin ?? null,
      cusip: dto.cusip ?? null,
      sedol: dto.sedol ?? null,
      ticker: dto.ticker ?? null,
      bloombergId: dto.bloombergId ?? null,
      ric: dto.ric ?? null,
      displayName: dto.displayName,
      longName: dto.longName ?? null,
      assetClass: dto.assetClass,
      currency: dto.currency.toUpperCase(),
      exchange: dto.exchange ?? null,
      countryOfIssue: dto.countryOfIssue?.toUpperCase() ?? null,
      sector: dto.sector ?? null,
      industry: dto.industry ?? null,
      couponRate: dto.couponRate?.toString() ?? null,
      maturityDate: dto.maturityDate ?? null,
      faceValue: dto.faceValue?.toString() ?? null,
      couponFrequency: dto.couponFrequency ?? null,
      creditRating: dto.creditRating ?? null,
      derivativeType: (dto.derivativeType as Instrument['derivativeType']) ?? null,
      underlyingId: dto.underlyingId ?? null,
      derivativeDetails: dto.derivativeDetails ?? null,
      lotSize: dto.lotSize?.toString() ?? '1',
      priceMultiplier: dto.priceMultiplier?.toString() ?? '1',
    };

    if (instrument) {
      await this.instrumentRepo.update(instrument.id, data);
      return this.findByIdOrThrow(instrument.id);
    }

    instrument = this.instrumentRepo.create(data);
    return this.instrumentRepo.save(instrument);
  }

  async updatePrice(instrumentId: string, price: number): Promise<Instrument> {
    await this.instrumentRepo.update(instrumentId, {
      lastPrice: price.toString(),
      priceUpdatedAt: new Date(),
    });
    return this.findByIdOrThrow(instrumentId);
  }

  async search(query: string, assetClass?: AssetClass, limit = 20): Promise<Instrument[]> {
    const qb = this.instrumentRepo
      .createQueryBuilder('i')
      .where('i.instrument_status = :status', { status: InstrumentStatus.ACTIVE })
      .andWhere(
        '(i.ticker ILIKE :q OR i.isin ILIKE :q OR i.cusip ILIKE :q OR i.display_name ILIKE :q)',
        { q: `%${query}%` },
      )
      .limit(limit);

    if (assetClass) qb.andWhere('i.asset_class = :ac', { ac: assetClass });

    return qb.getMany();
  }

  async findByIdOrThrow(id: string): Promise<Instrument> {
    const i = await this.instrumentRepo.findOne({ where: { id } });
    if (!i) throw new NotFoundException(`Instrument ${id} not found`);
    return i;
  }

  async findByIsin(isin: string): Promise<Instrument | null> {
    return this.instrumentRepo.findOne({ where: { isin: isin.toUpperCase() } });
  }

  async findByTicker(ticker: string, exchange?: string): Promise<Instrument | null> {
    const qb = this.instrumentRepo
      .createQueryBuilder('i')
      .where('i.ticker = :ticker', { ticker: ticker.toUpperCase() });
    if (exchange) qb.andWhere('i.exchange = :exchange', { exchange });
    return qb.getOne();
  }

  async findByAssetClass(assetClass: AssetClass, limit = 100): Promise<Instrument[]> {
    return this.instrumentRepo.find({
      where: { assetClass, instrumentStatus: InstrumentStatus.ACTIVE },
      order: { ticker: 'ASC' },
      take: limit,
    });
  }
}
