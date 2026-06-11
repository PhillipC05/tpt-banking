import { Module } from '@nestjs/common';
import { BlackScholesService } from './black-scholes.service';
import { MonteCarloService } from './monte-carlo.service';
import { BinomialTreeService } from './binomial-tree.service';
import { OptionsController } from './options.controller';

@Module({
  providers: [BlackScholesService, MonteCarloService, BinomialTreeService],
  controllers: [OptionsController],
  exports: [BlackScholesService, MonteCarloService, BinomialTreeService],
})
export class OptionsModule {}
