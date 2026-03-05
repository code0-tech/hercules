#!/usr/bin/env ruby
# frozen_string_literal: true

require 'grpc'
require 'tucana'

Tucana.load_protocol(:aquila)

class State
  attr_reader :data_types, :runtime_functions, :flow_types, :action_config_definitions

  def initialize
    @data_types = []
    @runtime_functions = []
    @flow_types = []
    @action_config_definitions = []
  end

  def add_flow_types(flow_types)
    @flow_types += flow_types
  end

  def add_data_types(dts)
    @data_types += dts
  end

  def add_runtime_functions(functions)
    @runtime_functions += functions
  end

  def add_action_config_definition(config)
    @action_config_definitions << config
  end
end

class FlowTypeTransferService < Tucana::Aquila::FlowTypeService::Service
  def initialize(state)
    @state = state
  end

  def update(req, _call)
    @state.add_flow_types(req.flow_types)

    puts "Flowtypes received: #{req.flow_types.map(&:identifier).join(', ')}"

    Tucana::Aquila::RuntimeFunctionDefinitionUpdateResponse.new(success: true)
  end
end

class RuntimeFunctionDefinitionTransferService < Tucana::Aquila::RuntimeFunctionDefinitionService::Service
  def initialize(state)
    @state = state
  end

  def update(req, _call)
    @state.add_runtime_functions(req.runtime_functions)

    puts "RuntimeFunctionDefinitions received: #{req.runtime_functions.map(&:runtime_name).join(', ')}"

    Tucana::Aquila::RuntimeFunctionDefinitionUpdateResponse.new(success: true)
  end
end

class DataTypeTransferService < Tucana::Aquila::DataTypeService::Service
  def initialize(state)
    @state = state
  end

  def update(req, _call)
    @state.add_data_types(req.data_types)
    puts "Data types received: #{req.data_types.map(&:identifier).join(', ')}"
    Tucana::Aquila::DataTypeUpdateResponse.new(success: true)
  end
end

class ActionTransferService < Tucana::Aquila::ActionTransferService::Service
  def initialize(state)
    @state = state
    @sent_configs = []
  end

  def transfer(requests, _call)
    Enumerator.new do |yielder|
      Thread.new do
        loop do
          sleep 5
          @state.action_config_definitions.each do |config|
            if @sent_configs.include?(config[:identifier])
              next
            end
            puts "Received action config definition: #{config[:action_identifier]} (v#{config[:version]})"
            puts "Creating mock project config"
            proj_conf = Tucana::Shared::ActionProjectConfiguration.new(
              project_id: 128,
              action_configurations: [
                Tucana::Shared::ActionConfiguration.new(
                  identifier: config[:identifier],
                  value: Tucana::Shared::Value.from_ruby("test value for #{config[:identifier]}")
                )
              ]
            )

            yielder << Tucana::Aquila::TransferResponse.new({
                                                               action_configurations:
                                                                 Tucana::Shared::ActionConfigurations.new(action_configurations: [proj_conf])
                                                             })
            @sent_configs << config[:identifier]
          end
        end
      end

      requests.each do |req|

        unless req.logon.nil?
          logon = req.logon

          @state.add_action_config_definition({
                                                action_identifier: logon.action_identifier,
                                                version: logon.version,
                                                config_definitions: logon.action_configurations
                                              })

          puts "Action logon received: #{logon.action_identifier} (v#{logon.version})"
        end
      end
    end
  end
end

state = State.new

server = GRPC::RpcServer.new
server.add_http2_port('0.0.0.0:50051', :this_port_is_insecure)
server.handle(ActionTransferService.new(state))
server.handle(DataTypeTransferService.new(state))
server.handle(RuntimeFunctionDefinitionTransferService.new(state))
server.handle(FlowTypeTransferService.new(state))
server.run_till_terminated_or_interrupted(%w[INT TERM QUIT])
