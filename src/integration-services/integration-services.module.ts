import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IntegrationServicesController } from './integration-services.controller';
import { ApiGatewayService } from './services/api-gateway.service';
import { ServiceMeshService } from './services/service-mesh.service';
import { FeatureFlagService } from './services/feature-flag.service';
import { RolloutOrchestrationService } from './services/rollout-orchestration.service';
import { GusApiService } from './gus-api.service';

@Module({
  imports: [ConfigModule],
  controllers: [IntegrationServicesController],
  providers: [
    ApiGatewayService,
    ServiceMeshService,
    FeatureFlagService,
    RolloutOrchestrationService,
    GusApiService,
  ],
  exports: [
    ApiGatewayService,
    ServiceMeshService,
    FeatureFlagService,
    RolloutOrchestrationService,
    GusApiService,
  ],
})
export class IntegrationServicesModule { }